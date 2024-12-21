# Histori Node Service

Welcome to the **Histori Node Service** repository. This project provides the core functionality for handling blockchain data requests. It includes utilities for building, deploying, and running the service in development and production environments.
---

## 🛠️ Requirements

- **Node.js**: Version 16 or higher
- **npm**: Installed with Node.js
- Compatible browser for viewing the documentation.

---

## 📦 Project Setup
Follow these steps to set up the project locally:
1.	Install dependencies:
```bash
npm install
```
2. Ensure your environment variables are properly configured in a .env file or set in your shell.


## 📖 Configuring `networks.json`

The `networks.json` file is where you configure network-specific details for accessing blockchain data through the Histori RPC Router. This includes RPC URLs and network IDs. You can fill this configuration with custom RPC URLs or use **Histori’s multi-RPC service** for seamless integration.

---

### 📝 How to Fill `networks.json`

1. **Understand the Fields**:
   - **`networkId`**: A unique identifier for the network (e.g., `eth-mainnet`).
   - **`rpc`**: List of RPC URLs for the network.

2. **Option 1: Using Custom RPC URLs**:
   - Replace the `<YOUR_HISTORI_PROJECT_ID_HERE>` placeholder in the `rpc.url` with your preferred RPC URL.
   - Example:
     ```json
     {
         "url": "https://custom-node.example.com/eth-mainnet"
     }
     ```

3. **Option 2: Using Histori Multi-RPC Service**:
   - Histori provides a multi-RPC service with optimized performance and reliability. Follow these steps to obtain your `projectId`:

---

### 🔑 Steps to Get Your `projectId` for Histori Multi-RPC Service

1. **Visit the Histori Dashboard**:
   - Go to the [Histori Dashboard](https://histori.xyz/dashboard) and log in or sign up for an account.

2. **Create a Project**:
   - Navigate to the **Projects** section and click **Create New Project**.
   - Fill in your project details and save.

3. **Get Your `projectId`**:
   - Once your project is created, you’ll see a unique `projectId` associated with it.
   - Example: `abc123xyz456`

4. **Update `networks.json`**:
   - Replace `<YOUR_HISTORI_PROJECT_ID_HERE>` in the RPC URLs with your `projectId`.
   - Example:
     ```json
     {
         "url": "https://node.histori.xyz/eth-mainnet?projectId=abc123xyz456"
     }
     ```

---

### 🛠 Example `networks.json`

```json
[
    {
        "networkId": "eth-mainnet",
        "rpc": [
            {
                "url": "https://node.histori.xyz/eth-mainnet?projectId=abc123xyz456"
            }
        ],
    },
    {
        "networkId": "eth-sepolia",
        "rpc": [
            {
                "url": "https://node.histori.xyz/eth-sepolia?projectId=abc123xyz456"
            }
        ],
    }
]
```


## 🛡️ Contributing

We welcome contributions to improve the Histori RPC router. To contribute:
1. Fork this repository.
2. Make your changes.
3. Submit a pull request with a detailed description of your updates.

Please ensure that any edits maintain clarity and follow the existing structure.

---

## 📫 Support

For any issues or questions, reach out to us:
- **Email**: support@histori.xyz
- **Website**: [histori.xyz](https://histori.xyz)
- **API Documentation**: [docs.histori.xyz](https://docs.histori.xyz)
- **Telegram**: [Join](https://t.me/+Khm3XK761_Y1NWI8)

---

⭐️ From the [Histori Team](https://github.com/orgs/Esscrypt/teams/core) – Your gateway to blockchain insights.