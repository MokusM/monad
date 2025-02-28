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
- **Random Module Order**: Runs all modules in random order for each wallet
- **Multi-Account Support**: Processes multiple wallets with different proxies
- **Error Handling**: Continues processing other wallets if one fails
- **Interactive Mode**: Choose which module to run and configure parameters

## Available Modules

1. **Staking**: Stake MON tokens on aPriori protocol
2. **Ambient Liquidity**: Add liquidity to Ambient DEX
3. **Velocore Liquidity**: Add liquidity to Velocore DEX
4. **Symbiotic Liquidity**: Add liquidity to Symbiotic DEX
5. **Monad Name Service (MNS)**: Register domain names on Monad Name Service
6. **NFT Marketplace**: Mint, list, and buy NFTs on Monad NFT Marketplace

## Usage

To run the bot, use the following command:

```bash
npm start
```

For interactive mode with hardcoded wallets (for testing):

```bash
node test-hardcoded.js
```

For interactive mode with wallet.txt:

```bash
node test.js
```

The bot will:
1. Check the balance of each wallet
2. Skip wallets with less than 1 MON
3. For each valid wallet, run selected modules
4. Display detailed logs of all operations

