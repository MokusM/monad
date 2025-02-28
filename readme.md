# Monad Testnet AIO

Monad Testnet bot. Multi-account and proxy supported. Automatically checks wallet balances and runs modules in random order.

## Installation

1. Clone the Repository

Clone this repository to your local machine using the following command:

```bash
git clone https://github.com/Zaptovcavis/monad-testnet.git
cd monad-testnet
```

2. Install the required dependencies:

   ```bash
   npm install
   ```

## Configuration

1.  **Add Private keys to `wallet.txt`**
    - Each private key should be on a new line
    - Do not include the "0x" prefix

2. **Add proxy to `proxy.txt`** file
    - Each proxy should be on a new line
    - Format: http://username:password@host:port

## Features

- **Balance Check**: Automatically checks wallet balances and skips wallets with less than 1 MON
- **Random Module Order**: Runs all modules (Rubic, Magma, Izumi, aPriori) in random order for each wallet
- **Multi-Account Support**: Processes multiple wallets with different proxies
- **Error Handling**: Continues processing other wallets if one fails

## Usage

To run the bot, use the following command:

```bash
npm start
```

The bot will:
1. Check the balance of each wallet
2. Skip wallets with less than 1 MON
3. For each valid wallet, run all modules (Rubic, Magma, Izumi, aPriori) in random order
4. Display detailed logs of all operations

