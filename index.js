import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
const port = 5000;

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
const serviceCollections = db.collection("services");
const serviceBookingCollections = db.collection("serviceBooking");
const userCollections = db.collection("user");

app.post("/services", async (req, res) => {
  await serviceCollections.insertOne(req.body);

  res.send({
    message: "Successfully service uploaded",
  });
});
app.get("/services", async (req, res) => {
  const query = {};
  if (req.query.active !== undefined)
    [(query.active = req.query.active === "true")];
  const data = await serviceCollections.find(query).toArray();
  res.send(data);
});
app.patch("/services/:id", async (req, res) => {
  const data = await serviceCollections.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body },
  );
  res.send({ message: "successfully updated" });
});
app.delete("/services/:id", async (req, res) => {
  const data = await serviceCollections.deleteOne({
    _id: new ObjectId(req.params.id),
  });
  res.send({ message: "successfully deleted" });
});
app.get("/services/:id", async (req, res) => {
  const data = await serviceCollections.findOne({
    _id: new ObjectId(req.params.id),
  });
  res.send(data);
});

//booking
app.post("/bookingAppointment", async (req, res) => {
  const count = await serviceBookingCollections.countDocuments({
    "appointmentDate": req.body.appointmentDate,
    "timeSlot": req.body.timeSlot,
  });
  if (count) {
    res
      .status(409)
      .send({
        ok: false,
        message: "date and time is already taken",
      });
    return;
  }
  const data = await serviceBookingCollections.insertOne(req.body);
  res.send({ok: true, message: "successfully uploaded" });
});
app.get("/bookingAppointment/timeslot", async (req, res) => {
  try {
    const { serviceId, appointmentDate } = req.query;

    if (!serviceId || !appointmentDate) {
      return res
        .status(400)
        .send({ message: "serviceId and appointmentDate are required" });
    }

    const data = await serviceBookingCollections
      .find(
        { serviceId, appointmentDate },
        { projection: { _id: 0, timeSlot: 1 } },
      )
      .toArray();

    res.send(data.map((item) => item.timeSlot));
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Server error" });
  }
});
//booking for admin
app.get("/bookingAppointment", async (req, res) => {
  const data = await serviceBookingCollections.find({}).toArray();
  res.send(data);
});
app.patch("/bookingAppointment/:id", async (req, res) => {
  console.log(req.params.id)
  const data = await serviceBookingCollections.updateOne({"_id":new ObjectId(req.params.id)},{$set:{...req.body}})
  res.send({
    ok:true,
    message:"Booking data updated successfully"
  });
});
app.get("/bookingAppointment/single/:id", async (req, res) => {
  const data = await serviceBookingCollections.findOne({"_id":new ObjectId(req.params.id)})
  res.send(data);
});



// user api
app.get("/users", async (req, res) => {
  const data = await userCollections.find({ role: "customer" }).toArray();
  res.send(data);
});
app.patch("/users/:id", async (req, res) => {
  const data = await userCollections.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body },
  );
  res.send({ok:true, message: "successfully updated" });
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
export default app