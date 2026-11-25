import express from "express"
import cors from "cors"
import 'dotenv/config'
import { MongoClient, ObjectId } from "mongodb"

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
const serviceCollections=db.collection("services")

app.post("/services",async(req,res)=>{
  await serviceCollections.insertOne(req.body)

  res.send({
    message:"Successfully service uploaded"
  })
})
app.get("/services",async(req,res)=>{
  const data=await serviceCollections.find({}).toArray()
  res.send(data)
})
app.patch("/services/:id",async(req,res)=>{
  const data=await serviceCollections.updateOne({"_id":new ObjectId(req.params.id)},{$set:req.body})
  res.send({message:"successfully updated"})
})
app.delete("/services/:id",async(req,res)=>{
  const data=await serviceCollections.deleteOne({"_id":new ObjectId(req.params.id)})
  res.send({message:"successfully deleted"})
})

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})