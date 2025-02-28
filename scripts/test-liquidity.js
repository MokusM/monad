require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const { runLiquidityProvision } = require('./liquidity-multi');

const RPC_URL = 'https://testnet-rpc.monad.xyz/';
const USDC_CONTRACT = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

async function main() {
  try {
    console.log('Starting liquidity provision test...'.cyan);
    
    // Використовуємо тестовий приватний ключ (замініть на свій)
    const privateKey = '0x0000000000000000000000000000000000000000000000000000000000000000'; // Замініть на свій приватний ключ
    
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log(`Using wallet: ${wallet.address}`.yellow);
    
    // Перевіряємо баланс MON
    const monBalance = await provider.getBalance(wallet.address);
    console.log(`MON Balance: ${ethers.utils.formatEther(monBalance)} MON`.green);
    
    // Перевіряємо баланс USDC
    const usdcContract = new ethers.Contract(
      USDC_CONTRACT,
      ['function balanceOf(address account) external view returns (uint256)'],
      wallet
    );
    
    const usdcBalance = await usdcContract.balanceOf(wallet.address);
    console.log(`USDC Balance: ${ethers.utils.formatUnits(usdcBalance, 6)} USDC`.green);
    
    // Перевіряємо, чи достатньо коштів для операції
    if (monBalance.lt(ethers.utils.parseEther('0.01'))) {
      console.log('❌ Insufficient MON balance. Please get MON from a faucet.'.red);
      return;
    }
    
    if (usdcBalance.lt(ethers.utils.parseUnits('1', 6))) {
      console.log('❌ Insufficient USDC balance. Please get USDC from a faucet.'.red);
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