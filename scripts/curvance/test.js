const CurvanceClient = require('./curvance-client');
require('dotenv').config();

async function main() {
    try {
        // Створюємо екземпляр клієнта
        const client = new CurvanceClient(process.env.PRIVATE_KEY);

        // Перевіряємо баланс
        console.log('Checking account balance...');
        const balance = await client.getAccountBalance();
        console.log('Account balance:', balance);

        // Перевіряємо статус vault
        await client.checkVaultStatus();

        // Перевіряємо можливості для отримання прибутку
        await client.checkProfitOpportunities();

    } catch (error) {
        console.error('Error in main:', error);
    }
}

main(); 