const { MongoClient } = require('mongodb');
const sharp = require('sharp'); // Pre-load common dependencies

// --- CONFIGURATION ---
const MONGO_URL = "mongodb://127.0.0.1:3001/meteor"; 
const client = new MongoClient(MONGO_URL);

/**
 * THE ENGINE: Watches connectors and executes logic stored in the database.
 */
async function run() {
  await client.connect();
  const db = client.db();
  
  const connectorsCol = db.collection('connectors');
  const definitionsCol = db.collection('component_definitions');
  const providersCol = db.collection('providers_status');

  console.log("🚀 CONNECTOR ENGINE ONLINE");
  console.log("Listening for new or updated connectors...");

  // WATCH THE CONNECTORS COLLECTION
  const connectorStream = connectorsCol.watch([
    { $match: { 'operationType': { $in: ['insert', 'update', 'replace'] } } }
  ], { fullDocument: 'updateLookup' });

  connectorStream.on('change', async (change) => {
    const connector = change.fullDocument;
    
    // Only process if enabled
    if (!connector.enabled) return;

    console.log(`\n[${new Date().toISOString()}] Triggering Connector: ${connector.name}`);

    try {
      // 1. GET THE LIVE DATA (The "Fuel" for the pipeline)
      // We find the provider document that matches the topic defined in this connector
      const providerDoc = await providersCol.findOne({ 
        topic: connector.providerOptions?.topic 
      });

      if (!providerDoc || !providerDoc.latestData) {
        console.warn(`⚠️ No live data found in providers_status for topic: ${connector.providerOptions?.topic}`);
        return;
      }

      const livePayload = providerDoc.latestData;

      // 2. GET THE PARSER CODE
      const parserDef = await definitionsCol.findOne({ name: connector.parser, type: 'parser' });
      if (!parserDef) throw new Error(`Parser definition [${connector.parser}] not found`);

      // 3. COMPILE AND RUN PARSER
      const parserFn = eval(parserDef.code); 
      const parsedResult = await parserFn(livePayload, connector.parserOptions || {});

      // Update Parser Status
      await db.collection("parsers_status").updateOne(
        { id: connector.parser, connector: connector.name },
        { $set: { lastRun: new Date() } },
        { upsert: true }
      );

      // 4. RUN CONSUMERS
      for (const consumerName of connector.consumers) {
        const consumerDef = await definitionsCol.findOne({ name: consumerName, type: 'consumer' });
        if (!consumerDef) {
            console.error(`Consumer definition [${consumerName}] not found`);
            continue;
        }

        // COMPILE AND RUN CONSUMER
        const consumerObj = eval(`(${consumerDef.code})`);
        const options = connector.consumerOptions?.[consumerName] || {};

        await consumerObj.send(parsedResult, connector, options);

        // Update Consumer Status
        await db.collection("consumers_status").updateOne(
          { id: consumerName, connector: connector.name },
          { $set: { lastRun: new Date() } },
          { upsert: true }
        );
      }

      console.log(`✅ Connector [${connector.name}] executed successfully.`);

    } catch (err) {
      console.error(`❌ Execution Failed for [${connector.name}]:`, err.message);
    }
  });
}

run().catch(console.dir);