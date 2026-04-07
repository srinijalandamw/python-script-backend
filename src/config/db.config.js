

//This db.config.js file is to connect the project with mongoDB
//Whenever the server calls it , establishes the connection




const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🔌 DB Connected inside db.config");
  } catch (err) {
    console.error("DB Error:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;