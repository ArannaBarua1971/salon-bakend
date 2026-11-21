import express from "express"
import cors from "cors"
import 'dotenv/config'

const app = express()
const port = 5000

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.DATABASE_URL);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const dbClient = await connectToMongoDB();
const db = dbClient.db("salon");

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})