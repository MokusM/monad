const config = {
    // RPC та Explorer URLs
    RPC_URL: 'https://testnet-rpc.monad.xyz/',
    EXPLORER_URL: 'https://testnet.monadexplorer.com/tx/',
    
    // Контракти
    CONTRACTS: {
        WMON: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
    },

    // NFT контракти для відстеження
    NFT_CONTRACTS: [
        // {
        //     address: '0xNFT_CONTRACT_ADDRESS_1',
        //     name: 'NFT Collection 1'
        // },
        // {
        //     address: '0xNFT_CONTRACT_ADDRESS_2',
        //     name: 'NFT Collection 2'
        // }
    ],

    // Налаштування балансів
    MIN_BALANCE: '1.0', // в MON

    // Масив гаманців
    WALLETS: [
        // Додайте свої приватні ключі
        '0xYOUR_PRIVATE_KEY_1',
        '0xYOUR_PRIVATE_KEY_2',
        '0xYOUR_PRIVATE_KEY_3',
    ],

    // Масив проксі
    PROXIES: [
        // Додайте свої проксі
        'http://user:pass@proxy1.example.com:8080',
        'http://user:pass@proxy2.example.com:8080',
        'http://user:pass@proxy3.example.com:8080',
    ],

    // Налаштування затримок
    DELAYS: {
        MIN_DELAY: 60, // мінімальна затримка в секундах
        MAX_DELAY: 600, // максимальна затримка в секундах
    },

    // Налаштування сум транзакцій
    AMOUNTS: {
        MIN_AMOUNT: 0.01, // мінімальна сума в MON
        MAX_AMOUNT: 0.05, // максимальна сума в MON
    },

    // Налаштування газу
    GAS: {
        DEFAULT_GAS_LIMIT: 500000,
        GAS_MULTIPLIER: 1.2,
    }
};

module.exports = config; 