require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const fs = require('fs');
const { runLiquidityProvision } = require('./liquidity-multi');

const RPC_URL = 'https://testnet-rpc.monad.xyz/';

async function main() {
  try {
    console.log('Starting liquidity provision test...'.cyan);
    
    // Читаємо перший приватний ключ з файлу wallet.txt
    let privateKey;
    try {
      const wallets = fs
        .readFileSync('wallet.txt', 'utf8')
        .split('\n')
        .filter(Boolean);
      
      if (wallets.length === 0) {
        console.error('❌ No private keys found in wallet.txt'.red);
        return;
      }
      
      privateKey = wallets[0].trim();
      console.log('✅ Successfully loaded private key from wallet.txt'.green);
    } catch (error) {
      console.error('❌ Error reading wallet.txt:'.red, error.message);
      return;
    }
    
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log(`Using wallet: ${wallet.address}`.yellow);
    
    // Перевіряємо баланс MON
    const monBalance = await provider.getBalance(wallet.address);
    console.log(`MON Balance: ${ethers.utils.formatEther(monBalance)} MON`.green);
    
    // Перевіряємо, чи достатньо коштів для операції
    if (monBalance.lt(ethers.utils.parseEther('0.03'))) { // Мінімум 0.03 MON (0.01 для WMON, 0.01 для ETH, 0.01 для газу)
      console.log('❌ Insufficient MON balance. Please get MON from a faucet.'.red);
      return;
    }
    
    // Запускаємо операцію додавання ліквідності
    console.log('\nRunning liquidity provision operation...'.cyan);
    await runLiquidityProvision(wallet);
    
    console.log('\nTest completed successfully!'.green.bold);
  } catch (error) {
    console.error('Error occurred:', error);
  }
}

main(); 