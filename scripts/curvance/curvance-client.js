const { ethers } = require('ethers');
const config = require('./config');

class CurvanceClient {
    constructor(privateKey) {
        this.provider = new ethers.providers.JsonRpcProvider(config.RPC_URL);
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this.contracts = {};
        this.initializeContracts();
    }

    async initializeContracts() {
        // Ініціалізація контрактів буде додана пізніше
        // коли ми отримаємо ABI та адреси контрактів
    }

    async getAccountBalance() {
        try {
            const balance = await this.wallet.getBalance();
            return ethers.utils.formatEther(balance);
        } catch (error) {
            console.error('Error getting balance:', error);
            throw error;
        }
    }

    async checkVaultStatus() {
        // Буде реалізовано після отримання ABI
        console.log('Checking vault status...');
    }

    async depositToVault(amount) {
        // Буде реалізовано після отримання ABI
        console.log('Depositing to vault:', amount);
    }

    async withdrawFromVault(amount) {
        // Буде реалізовано після отримання ABI
        console.log('Withdrawing from vault:', amount);
    }

    async checkProfitOpportunities() {
        // Буде реалізовано після отримання даних про стратегії
        console.log('Checking profit opportunities...');
    }
}

module.exports = CurvanceClient; 