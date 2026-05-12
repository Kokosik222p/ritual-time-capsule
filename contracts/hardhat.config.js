require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          evmVersion: "cancun",
          optimizer: { enabled: true, runs: 200 }
        }
      }
    ]
  },
  networks: {
    ritual: {
      url: "https://rpc.ritualfoundation.org",
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};
