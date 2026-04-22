const mqtt = require('mqtt');
const { NodeVM } = require('vm2');

/**
 * Creates a sandboxed pipeline that:
 * 1. Listens to MQTT
 * 2. Parses data via a sandboxed function
 * 3. Updates 'parsers_status' and 'consumers_status' for the Dashboard
 * 4. Executes any attached Consumers
 */
async function createPipeline(config, db) {
  console.log(`[PIPELINE] Initializing ${config.name}...`);

  const definitionsCol = db.collection('component_definitions');
  const parsersStatusCol = db.collection('parsers_status');
  const consumersStatusCol = db.collection('consumers_status');

  // 1. Fetch Parser Code
  const parserDef = await definitionsCol.findOne({ 
    name: config.parser, 
    type: 'parser' 
  });

  if (!parserDef) throw new Error(`Parser ${config.parser} not found`);

  // 2. Create the Sandbox Environment (Safety first!)
  const vm = new NodeVM({
    timeout: 100,       // Kill execution if it takes > 100ms
    console: 'inherit', 
    sandbox: {},        
    require: {
      external: false,  
      builtin: [],     
    },
  });

  // 3. Compile the Parser
  let parserFn;
  try {
    parserFn = vm.run(`module.exports = ${parserDef.code};`);
  } catch (err) {
    throw new Error(`Syntax Error in Parser [${config.parser}]: ${err.message}`);
  }

  // 4. Setup MQTT Connection
  const client = mqtt.connect(config.providerOptions.brokerUrl, {
    username: config.providerOptions.username,
    password: config.providerOptions.password
  });

  client.on('connect', () => {
    client.subscribe(config.providerOptions.topic);
    console.log(`📡 [${config.name}] Subscribed to ${config.providerOptions.topic}`);
  });

  client.on('message', async (topic, message) => {
    try {
      const rawData = JSON.parse(message.toString());
      const now = new Date();
      
      // A. RUN PARSER
      const parsedData = await parserFn(rawData, config.parserOptions || {});
      
      // B. UPDATE DASHBOARD (Parser Status)
      await parsersStatusCol.updateOne(
        { id: config.parser, connector: config.name },
        { $set: { lastRun: now } },
        { upsert: true }
      );

      // C. RUN CONSUMERS (If any)
      if (config.consumers && Array.isArray(config.consumers)) {
        for (const consumerName of config.consumers) {
          const consumerDef = await definitionsCol.findOne({ name: consumerName, type: 'consumer' });
          
          if (!consumerDef) {
            console.error(`⚠️ Consumer [${consumerName}] not found in definitions.`);
            continue;
          }

          try {
            // Sandbox and execute the consumer
            const consumerObj = vm.run(`module.exports = ${consumerDef.code};`);
            const options = config.consumerOptions?.[consumerName] || {};
            
            // Execute the consumer's 'send' method
            await consumerObj.send(parsedData, config, options);

            // Update Consumer Status for the Dashboard
            await consumersStatusCol.updateOne(
              { id: consumerName, connector: config.name },
              { $set: { lastRun: now } },
              { upsert: true }
            );
          } catch (consErr) {
            console.error(`❌ Consumer [${consumerName}] Runtime Error:`, consErr.message);
          }
        }
      }
      
      // console.log(`[${config.name}] Processed:`, parsedData); // Optional: verbose logging
    } catch (err) {
      console.error(`   - [${config.name}] Pipeline Runtime Error:`, err.message);
    }
  });

  // 5. Return the control handle
  return {
    stop: () => {
      if (client) {
        client.end();
        console.log(`[PIPELINE] Stopped ${config.name}`);
      }
    }
  };
}

module.exports = { createPipeline };