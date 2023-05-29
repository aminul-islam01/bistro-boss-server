const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json())



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

    // menu collections operation start here
    app.get('/menu', async(req, res) => {
        const menu = await menuCollection.find().toArray();
        res.send(menu);
    })

    // review collections operation start here
    app.get('/reviews', async(req, res) => {
        const reviews = await reviewsCollection.find().toArray();
        res.send(reviews);
    })

    // user collections operations start here
    app.get('/users', async(req, res)=> {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })

    app.post('/users', async(req, res) => {
      const user = req.body;
      const query = {email: user.email}
      const existing = await usersCollection.findOne(query);
      if(existing) {
        return res.send('user already exist')
      }
      const result = await usersCollection.insertOne(user);
      res.send(user)
    })
    

    // carts collections operation start here
    app.get('/carts', async(req, res) => {
      const email = req.query.email;
      if(!email) {
        return res.send([])
      }
      const query = {email: email};
      const result = await cartsCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/carts', async(req, res) => {
      const item = req.body;
      const result = await cartsCollection.insertOne(item);
      res.send(result);
    })

    app.delete('/carts/:id', async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = cartsCollection.deleteOne(query);
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
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

