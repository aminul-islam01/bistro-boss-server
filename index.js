const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.aws78to.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const menuCollection = client.db("BistroBossDB").collection("menu");
    const reviewsCollection = client.db("BistroBossDB").collection("reviews");
    const usersCollection = client.db("BistroBossDB").collection("users");
    const cartsCollection = client.db("BistroBossDB").collection("carts");
    const paymentsCollection = client.db("BistroBossDB").collection("payments");

    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token })
    })

    // Warning: use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden message' });
      }
      next();
    }


    // menu collections operation start here
    app.get('/menu', async (req, res) => {
      const menu = await menuCollection.find().toArray();
      res.send(menu);
    })

    app.post('/menu', verifyJWT, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      const result = await menuCollection.insertOne(newItem);
      res.send(result)
    })

    // review collections operation start here
    app.get('/reviews', async (req, res) => {
      const reviews = await reviewsCollection.find().toArray();
      res.send(reviews);
    })

    // user collections operations start here
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existing = await usersCollection.findOne(query);
      if (existing) {
        return res.send('user already exist')
      }
      const result = await usersCollection.insertOne(user);
      res.send(user)
    })

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result)
    })

    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);
    })


    // carts collections operation start here
    app.get('/carts', verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.send([])
      }

      // verified valid user
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'forbidden access' })
      }


      const query = { email: email };
      const result = await cartsCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/carts', async (req, res) => {
      const item = req.body;
      const result = await cartsCollection.insertOne(item);
      res.send(result);
    })

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = cartsCollection.deleteOne(query);
      res.send(result)
    })

    // create payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card']
        // automatic_payment_methods: {
        //   enabled: true,
        // },
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });


    // payment related api
    app.post('/payments', verifyJWT, async (req, res) => {
      const payment = req.body;
      payment.menuItems = payment.menuItems.map(id => new ObjectId(id));

      const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } }
      const deleteResult = await cartsCollection.deleteMany(query);

      const insertResult = await paymentsCollection.insertOne(payment);
      res.send({ deleteResult, insertResult })
    })


    app.get('/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentsCollection.estimatedDocumentCount();

      // ------------- simple system------------
      // const payments = await paymentCollection.find().toArray();
      // const revenues = payments.reduce( ( sum, payment) => sum + payment.price, 0)

      // -------Best system---------
      const totalRevenue = await paymentsCollection.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: '$price' }
          }
        }
      ]).toArray();
      const revenues = totalRevenue[0].total;

      res.send({
        users,
        menuItems,
        orders,
        revenues
      })
    })

    app.get('/order-stats', async (req, res) => {
      const pipeline = [
        {
          $lookup: {
            from: 'menu',
            localField:'menuItems',
            foreignField:'_id',
            as: 'menuItemsData'
          }
        },
        {
          $unwind: '$menuItemsData'
        },
        {
          $group: {
            _id: '$menuItemsData.category',
            count: { $sum: 1 },
            total: { $sum: '$menuItemsData.price' }
          }
        },
        {
          $project: {
            category: '$_id',
            count: '$count',
            total: '$total',
            _id: 0
          }
        }
      ];
    
      const result = await paymentsCollection.aggregate(pipeline).toArray();
      res.send(result);
    });
    

    
    console.log("You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Bistro Boss Server is Running')
})

app.listen(port, () => {
  console.log(`Bistro Boss Server is running on port ${port}`)
})

