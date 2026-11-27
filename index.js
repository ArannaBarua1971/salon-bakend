import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import stripe from "stripe";
import {
  createRemoteJWKSet,
  jwtVerify,
} from "jose";

const Stripe = new stripe(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());



const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).send({
        message: "Unauthorized",
      });
    }
    
    const token = authHeader.split(" ")[1];
    
    const JWKS = createRemoteJWKSet(
      new URL(
        `${process.env.FrontendURL}/api/auth/jwks`
      )
    );
    const { payload } = await jwtVerify(
      token,
      JWKS
    );

    res.locals.auth = payload;

    next();
  } catch (error) {
    return res.status(401).send({
      message: "Invalid or expired token",
    });
  }
};
const verifyAdmin = (req, res, next) => {
  const user = res.locals.auth;

  if (!user || user.role !== "admin") {
    return res.status(403).send({
      message: "Forbidden: Admin access required",
    });
  }

  next();
};


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
const transactionCollections = db.collection("transaction");
const userCollections = db.collection("user");

app.post("/services",verifyToken,verifyAdmin, async (req, res) => {
  await serviceCollections.insertOne(req.body);

  res.send({
    message: "Successfully service uploaded",
  });
});
app.get("/services", async (req, res) => {
  const query = {};

  if (req.query.active !== undefined) {
    query.active = req.query.active === "true";
  }
  if(req.query.category!==undefined){
    query.category=req.query.category
  }
  if(req.query.search!==undefined){
    query.$or=[
      {name:{$regex:req.query.search,$options:"i"}},
      {category:{$regex:req.query.search,$options:"i"}},
      {description:{$regex:req.query.search,$options:"i"}}
    ]
  }

  const data = await serviceCollections.find(query).toArray();
  res.send(data);
});
app.patch("/services/:id",verifyToken,verifyAdmin, async (req, res) => {
  const data = await serviceCollections.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body },
  );
  res.send({ message: "successfully updated" });
});
app.delete("/services/:id",verifyToken,verifyAdmin, async (req, res) => {
  const data = await serviceCollections.deleteOne({
    _id: new ObjectId(req.params.id),
  });
  res.send({ message: "successfully deleted" });
});
app.get("/services/:id",verifyToken, async (req, res) => {
  const data = await serviceCollections.findOne({
    _id: new ObjectId(req.params.id),
  });
  res.send(data);
});

//booking
app.post("/bookingAppointment",verifyToken, async (req, res) => {
  const count = await serviceBookingCollections.countDocuments({
    appointmentDate: req.body.appointmentDate,
    timeSlot: req.body.timeSlot,
  });
  if (count) {
    res.status(409).send({
      ok: false,
      message: "date and time is already taken",
    });
    return;
  }
  const data = await serviceBookingCollections.insertOne(req.body);
  res.send({ ok: true, message: "successfully uploaded" });
});
app.get("/bookingAppointment/timeslot",verifyToken, async (req, res) => {
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
    res.status(500).send({ message: "Server error" });
  }
});

//booking for admin
app.get("/bookingAppointment",verifyToken, async (req, res) => {
  const query = {};
  if (req.query.id !== undefined) {
    query.customerId = req.query.id;
  }
  const data = await serviceBookingCollections.find(query).toArray();
  res.send(data);
});
// need to update
app.patch("/bookingAppointment/:id",verifyToken, async (req, res) => {
  
  if(req.body.status=="confirmed"){
    verifyAdmin
  }
  const data = await serviceBookingCollections.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { ...req.body } },
  );
  res.send({
    ok: true,
    message: "Booking data updated successfully",
  });
});
app.get("/bookingAppointment/single/:id",verifyToken, async (req, res) => {
  const data = await serviceBookingCollections.findOne({
    _id: new ObjectId(req.params.id),
  });
  res.send(data);
});

// user api
app.get("/users", verifyToken,verifyAdmin,async (req, res) => {
  const data = await userCollections.find({ role: "customer" }).toArray();
  res.send(data);
});
app.patch("/users/:id",verifyToken,verifyAdmin, async (req, res) => {
  const data = await userCollections.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body },
  );
  res.send({ ok: true, message: "successfully updated" });
});

//verify checkout
app.post("/payments/checkout-verify",verifyToken, async (req, res) => {
  const sessionId = req.body.session_id;

  if (!sessionId) {
    return res.send({ ok: false, message: "Session ID is required" });
  }
  try {
    const { status, payment_status, customer_email, metadata, payment_intent } =
      await Stripe.checkout.sessions.retrieve(sessionId);

    if (status === "complete" && payment_status === "paid") {
      // --------
      const existingPayment = await transactionCollections.findOne({
        _id: new ObjectId(payment_intent.id),
      });
      if (existingPayment) {
        return res.send({ ok: false, message: "Payment already verified" });
      }
      // --------

      // --------
      const serviceActiveConfirmed = await serviceCollections.countDocuments({
        _id: new ObjectId(metadata.serviceId),
        active: true,
      });
      if (!serviceActiveConfirmed) {
        return res.send({
          ok: false,
          message: "Appointment is not Activated yet by administrator",
        });
      }
      //--------

      // --------
      const bookingConfirmed = await serviceBookingCollections.countDocuments({
        _id: new ObjectId(metadata.appointmentId),
        status:"confirmed"
      });
      if (!bookingConfirmed) {
        return res.send({ ok: false, message: "Appointment is not confirmed yet by administrator" });
      }
      // // --------

      const salonData = await serviceCollections.findOne({
        _id: new ObjectId(metadata.serviceId),
      });
      const bookingData = await serviceBookingCollections.findOne({
        _id: new ObjectId(metadata.appointmentId),
      });
      const payment = {
        serviceName:salonData.name,
        category:salonData.category,
        appointmentDate:bookingData.appointmentDate,
        appointmentTime:bookingData.timeSlot,
        payment_id:payment_intent,
        customer_email,
        price:salonData.price,
      };

      const data = await transactionCollections.insertOne(payment);
      const update = await serviceBookingCollections.updateOne({_id:new ObjectId(metadata.appointmentId)},{$set:{paymentStatus:"paid"}});
      res.send({ ok: true, message: "Payment verified" });
      return;
    }
  } catch (error) {
    return res.send({ success: false, message: "Payment already verified" });
  }
});

//transactions
app.get("/transactions",verifyToken,verifyAdmin, async (req, res) => {
  const data = await transactionCollections.find({}).toArray();
  res.send(data);
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
export default app;
