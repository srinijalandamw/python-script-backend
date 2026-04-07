/**
 * ENV CONFIGURATION 
 * Loads .env variables 
 * Central place for config
 */

require("dotenv").config();

module.exports = {
    PORT: process.env.PORT || 3000,
    MONGO_URI: process.env.MONGO_URI,
    EXECUTION_MODE: process.env.EXECUTION_MODE || "docker"
};