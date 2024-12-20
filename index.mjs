import axios from 'axios';
import { readFile } from 'fs/promises';
const hashObject = (crypto, stableStringify, obj) => {
    try {
        const sortedString = stableStringify(obj); // Serialize object with sorted keys
        const hash = crypto.createHash('sha256');
        hash.update(sortedString);
        return hash.digest('hex');
    } catch (error) {
        console.error('Error hashing object:', error.message);
        return null;
    }
};

export const handler = async (event) => {
    const network = event.pathParameters?.network;
    const cancel = event.queryStringParameters?.cancel; // Indicates a cancel transaction
    const secure = event.queryStringParameters?.secure; // Use Flashbots secure transport
    const maxRefund = event.queryStringParameters?.maxRefund; // Use Flashbots secure transport
    const maxBlockNumber = event.queryStringParameters?.maxBlockNumber; // Use Flashbots secure transport
    const fast = event.queryStringParameters?.fast; // Use Flashbots secure transport

    const sendMulticall = event.queryStringParameters?.sendMulticall; // Use custom multicall transaction type
    const readMulticall = event.queryStringParameters?.readMulticall; // Use custom multicall transaction type

    const random = event.queryStringParameters?.random;
    const all = event.queryStringParameters?.all;
    const fallback = event.queryStringParameters?.fallback;

    const flags = { cancel, secure, maxRefund, sendMulticall, readMulticall, random, all, fallback, maxBlockNumber, fast };

    const networks = JSON.parse(await readFile(new URL('./networks.json', import.meta.url)));

    const supportedNetwork = networks.find(n => n.networkId === network);

    if (!supportedNetwork) {
        return createErrorResponse(
            400,
            `Unsupported network: ${network}. Supported networks can be found at: https://docs.histori.xyz/docs/networks`
        );
    }

    const payload = JSON.parse(event.body);

    try {
        if(process.env.NODE_ENV === 'development')
        {
            console.log(`Network: ${network}`);
            console.log(`Params: network=${network}, cancel=${cancel}, secure=${secure}, random=${random}, all=${all}, fallback=${fallback}, maxRefund=${maxRefund}, sendMulticall=${sendMulticall}, readMulticall=${readMulticall}, fast=${fast} maxBlockNumber=${maxBlockNumber}`);
            console.log(`Payload params: ${JSON.stringify(payload.params)}`);
        } 
        // Handle `secure` transactions
        if (secure || payload.method === 'eth_sendPrivateTransaction') {
            return await handleSecureTransaction(payload, maxRefund, flags);
        }

        if (cancel || payload.method === 'eth_cancelPrivateTransaction') {
            return await cancelPrivateTransaction(payload, maxRefund, flags);
        }

        // if (sendMulticall || payload.method === 'eth_sendMulticallTransaction') {
        //     return await handleSendMulticallTransaction(supportedNetwork, payload, flags);
        // }

        // if(readMulticall || payload.method === 'eth_multicall') {
        //     return await handleReadMulticallTransaction(supportedNetwork, payload, flags);
        // }

        return await handleProviderFlags(supportedNetwork, payload, flags);
        
    } catch (error) {
        console.error('Unhandled error:', error.message);
        return createErrorResponse(500, error.message);
    }

};

const handleProviderFlags = async (supportedNetwork, payload, flags) => {
    const { random, all, fallback } = flags;

    // Handle `random`
    if (random || payload.method === 'eth_callRandom') {
        // console.log('Using random provider.');
        return await handleRandom(supportedNetwork, payload, flags);
    }

    // Handle `all`
    if (all || payload.method === 'eth_callAll') {
        console.log('Using all providers.');
        return await handleAll(supportedNetwork, payload, flags);
    }

    if(fallback || payload.method === 'eth_callFallback') {
        console.log('Using fallback mechanism.');
        return await handleFallback(supportedNetwork, payload, flags);
    }

    // Default: Use the first provider
    console.log('Using default provider.');
    return await sendRequest(supportedNetwork.rpc[0], payload);
};

// Sends a private transaction to Flashbots
const handleSecureTransaction = async (payload, maxRefund, flags) => {
    if(process.env.NODE_ENV !== 'development' && network !== 'eth-mainnet') {
        return createErrorResponse(400, 'Secure transactions through Flashbots are only supported on Ethereum mainnet.');
    }

    console.log('Sending secure transaction:', payload);

    let privateTransactionPayload = payload; // Default to the original payload
    // we can construct the eth_sendPrivateTransaction call if the method is eth_sendRawTransaction
    if (flags.secure) {
        if(payload.method === 'eth_sendPrivateTransaction') {
            return createErrorResponse(400, 'Secure flag requested but method is already eth_sendPrivateTransaction. Use either eth_sendPrivateTransaction or secure flag.');
        }
        if(payload.method !== 'eth_sendRawTransaction') {
            return createErrorResponse(400, 'Secure flag requested but method is not eth_sendRawTransaction. We cannot deduce the raw transaction from the payload.');
        }
        console.log(`Raw transaction: ${payload.params[0]}`);
        const rawTransaction = payload.params[0]; // Extract RLP encoded raw transaction

        if (!rawTransaction) {
            return createErrorResponse(400, 'Missing raw transaction data in payload.');
        }

        // Construct the eth_sendPrivateTransaction call
        privateTransactionPayload = {
            jsonrpc: '2.0',
            method: 'eth_sendPrivateTransaction',
            params: [rawTransaction],
            id: payload.id || 1,
        };

        if(flags.maxBlockNumber ) {
            const ethers = await import('ethers');
            let hexBlockNumber = flags.maxBlockNumber;
            if(!ethers.isHexString(flags.maxBlockNumber)) {
                hexBlockNumber = ethers.hexlify(flags.maxBlockNumber);
            }
            if(process.env.NODE_ENV === 'development') console.log(`Max block number: ${hexBlockNumber}`);
            privateTransactionPayload.params = [rawTransaction, hexBlockNumber];
        }
        if(flags.fast) {
            privateTransactionPayload.params.push({ fast: flags.fast});
            if(process.env.NODE_ENV === 'development') console.log(`payload with fast: ${JSON.stringify(privateTransactionPayload)}`);
        }

        console.log('Sending private transaction:', privateTransactionPayload);
    }

    try {
        const url = maxRefund ? 'https://rpc.flashbots.net/fast?hint=calldata&hint=contract_address&hint=function_selector&hint=logs' : 'https://rpc.flashbots.net/fast?hint=hash';
        const response = await axios.post(url, privateTransactionPayload, {
            headers: { 'Content-Type': 'application/json' },
        });

        return createSuccessResponse(response.data);
    } catch (error) {
        console.error('Error sending private transaction:', error.message);
        return createErrorResponse(500, error.message);
    }

};

// Cancels a private transaction in Flashbots
const cancelPrivateTransaction = async (payload, maxRefund, flags) => {
    if(process.env.NODE_ENV !== 'development' && network !== 'eth-mainnet') {
        return createErrorResponse(400, 'Secure transactions through Flashbots are only supported on Ethereum mainnet.');
    }

    let cancelPayload = payload; // Default to the original payload
    // we can construct the eth_sendPrivateTransaction call if the method is eth_sendRawTransaction
    if (flags.cancel) {
        if(payload.method === 'eth_cancelPrivateTransaction') {
            return createErrorResponse(400, 'Cancel flag requested but method is already eth_cancelPrivateTransaction. Use either eth_cancelPrivateTransaction or the cancel query parameter.');
        }

        const txHash = payload.params[0].txHash;
        console.log('Cancelling private transaction:', txHash);

        if (!txHash) {
            return createErrorResponse(400, 'Missing txHash in payload for cancel request.');
        }

        // Construct the eth_sendPrivateTransaction call
        cancelPayload = {
            jsonrpc: '2.0',
            method: 'eth_cancelPrivateTransaction',
            params: [txHash],
            id: payload.id || 1,
        };

        if(process.env.NODE_ENV === 'development') console.log('Cancelling private transaction:', cancelPayload);
    }

    try {
        const url = maxRefund ? 'https://rpc.flashbots.net/fast?hint=calldata&hint=contract_address&hint=function_selector&hint=logs' : 'https://rpc.flashbots.net/fast?hint=hash';
        
        const response = await axios.post(url, cancelPayload, {
            headers: { 'Content-Type': 'application/json' },
        });

        return createSuccessResponse(response.data);
    } catch (error) {
        console.error('Error canceling private transaction:', error.message);
        return createErrorResponse(500, error.message);
    }

};

// Handle Send Multicall transaction
// const handleSendMulticallTransaction = async (supportedNetwork, payload, flags) => {
//     const ethers = await import('ethers'); // Dynamically import ethers
//     const providerUrl = supportedNetwork.rpc[0].url;
//     const provider = new ethers.JsonRpcProvider(providerUrl);

//     const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
//     const MULTICALL3_ABI = JSON.parse(await readFile(new URL('./multicall3-abi.json', import.meta.url)));

//     const multicallContract = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);

//     const payload = JSON.parse(body);

//     let calls = payload.params; // optimistically assume that the payload is already in the correct format
//     if(flags.sendMulticall) {
//         if(payload.method === 'eth_sendMulticallTransaction') {
//             return createErrorResponse(400, 'Cannot specify eth_sendMulticallTransaction method with sendMulticall flag. Use either eth_sendMulticallTransaction or sendMulticall flag.');
//         }
//         if (!payload.params || !Array.isArray(payload.params)) {
//             return createErrorResponse(400, 'Invalid or missing transactions array in payload params.');
//         }

//         calls = payload.params.map((tx) => {
//             const decodedTx = ethers.Transaction.from(tx);
//             return {
//                 target: decodedTx.to, // 'to' address
//                 callData: decodedTx.data, // 'data' field
//                 value: decodedTx.value, // transaction value
//             };
//         });
//     }

//     try {
//         const tx = await multicallContract.aggregate3Value(calls);
//         const payload = {
//             jsonrpc: '2.0',
//             method: 'eth_sendRawTransaction',
//             params: [tx],
//             id: 1,
//         };
//         handleProviderFlags(supportedNetwork, payload, flags);
//         return createSuccessResponse({
//             transactionHash: tx.hash,
//         });
//     } catch (error) {
//         console.error('Error sending multicall transaction:', error.message);
//         return createErrorResponse(500, error.message);
//     }
// };

// // Handle Send Multicall transaction
// const handleReadMulticallTransaction = async (supportedNetwork, body, readMulticallFlagRequested) => {
//     const ethers = await import('ethers'); // Dynamically import ethers
//     const providerUrl = supportedNetwork.rpc[0].url;
//     const provider = new ethers.JsonRpcProvider(providerUrl);

//     const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
//     const MULTICALL3_ABI = JSON.parse(await readFile(new URL('./multicall3-abi.json', import.meta.url)));

//     const multicallContract = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);

//     let calls = payload.params; // optimistically assume that the payload is already in the correct format
//     if(readMulticallFlagRequested) {
//         if(payload.method === 'eth_multicall') {
//             return createErrorResponse(400, 'Cannot specify eth_multicall method with readMulticall flag. Use either eth_multicall or the readMulticall flag.');
//         }
//         if (!payload.params || !Array.isArray(payload.params)) {
//             return createErrorResponse(400, 'Invalid or missing transactions array in payload params.');
//         }

//         calls = payload.params.map((call) => {
//             return {
//                 from: call.from, // 'to' address
//                 to: call.to, // 'to' address
//                 gas: call.gas, // transaction gas
//                 gasPrice: call.gasPrice, // transaction gas price
//                 value: call.value, // transaction value
//                 callData: call.data, // 'data' field
//             };
//         });
//     }

//     try {
//         const results = await multicallContract.aggregate3Value(calls);
//         return createSuccessResponse({
//             results,
//         });
//     } catch (error) {
//         console.error('Error sending multicall transaction:', error.message);
//         return createErrorResponse(500, error.message);
//     }
// };

// Helper to handle `random` parameter
const handleRandom = async (supportedNetwork, payload, flags) => {
    if(flags.random) {
        if(payload.method === 'eth_callRandom') {
            return createErrorResponse(400, 'Cannot specify eth_callRandom method with random flag. Use either eth_callRandom or the random flag.');
        }
        if(payload.method === 'eth_sendRandom') {
            return createErrorResponse(400, 'Cannot specify eth_sendRandom method with random flag. Use either eth_sendRandom or the random flag.');
        }
    }
    let randomPayload = payload;
    if(payload.method === 'eth_callRandom') {
        randomPayload = {
            jsonrpc: '2.0',
            method: 'eth_call',
            params: payload.params,
            id: payload.id || 1,
        }
    }
    if(payload.method === 'eth_sendRandom') {
        randomPayload = {
            jsonrpc: '2.0',
            method: 'eth_sendTransaction',
            params: payload.params,
            id: payload.id || 1,
        }
    }
    const randomProvider = supportedNetwork.rpc[Math.floor(Math.random() * supportedNetwork.rpc.length)];
    console.log('Using random provider:', randomProvider.url);
    return await sendRequest(randomProvider, randomPayload);
};

// Helper to handle `all` parameter
const handleAll = async (supportedNetwork, payload, flags) => {
    if(flags.all) {
        if(payload.method === 'eth_callAll') {
            return createErrorResponse(400, 'Cannot specify eth_callAll method with all flag. Use either eth_callAll or the all flag.');
        }
        if(payload.method === 'eth_sendAll') {
            return createErrorResponse(400, 'Cannot specify eth_sendAll method with all flag. Use either eth_sendAll or the all flag.');
        }
    }
        
    let allPayload = payload;
    if(payload.method === 'eth_callAll') {
        allPayload = {
            jsonrpc: '2.0',
            method: 'eth_call',
            params: payload.params,
            id: payload.id || 1,
        }
    }
    if(payload.method === 'eth_sendAll') {
        allPayload = {
            jsonrpc: '2.0',
            method: 'eth_sendTransaction',
            params: payload.params,
            id: payload.id || 1,
        }
    }

    if(process.env.NODE_ENV === 'development') console.log('Using all providers:', supportedNetwork.rpc.map(p => p.url));
    try{
        const responses = await Promise.allSettled(
            supportedNetwork.rpc.map(provider => sendRequest(provider, allPayload))
        );

        if(process.env.NODE_ENV === 'development') console.log('all responses:', JSON.stringify(responses, null, 2));
        // console.log('All responses:', responses.length);
    
        // Filter responses with status code 200
        const successfulResponses = responses
            .filter(res => res.status === 'fulfilled' && res.value.statusCode === 200)
            .map(res => res.value);

        if(process.env.NODE_ENV === 'development') console.log('Successful responses:', successfulResponses);
        // console.log('Successful responses:', successfulResponses.length);
    
        if (successfulResponses.length === 0) {
            return createErrorResponse(500, 'All RPC calls failed.');
        }
    
        const [firstResponse, ...otherResponses] = successfulResponses;
        // Compute and log hashes for all successful responses
        const crypto = await import('crypto');
        const stableStringify = await import('json-stable-stringify');
        const firstHash = hashObject(crypto, stableStringify, JSON.parse(firstResponse.body).result);
    
        const allSame = otherResponses.every(res => hashObject(crypto, stableStringify, JSON.parse(res.body).result) === firstHash);
    
        if (allSame) {
            if(process.env.NODE_ENV === 'development') {
                const debugStructs = successfulResponses.map(res => ({ hash: hashObject(crypto, stableStringify, JSON.parse(res.body).result), response: res }));
                console.log('all responses:', JSON.stringify(debugStructs, null, 2));

                console.log('All responses are identical. Returning the first response.');
            }

            return firstResponse;
        } else {
            if(process.env.NODE_ENV === 'development') {
                const debugStructs = successfulResponses.map(res => ({ hash: hashObject(crypto, stableStringify, JSON.parse(res.body).result), response: res }));
                console.log('all responses:', JSON.stringify(debugStructs, null, 2));
            }

            // find error message from responses
            const errorMessages = [
                ...new Set(
                  successfulResponses
                    .filter(res => JSON.parse(res.body).error) // Filter responses with errors
                    .map(res => JSON.parse(res.body).error.message) // Extract error messages
                ),
              ].join(', ');
              let response =  `Responses from all RPCs are not identical.`;
              if(errorMessages.length > 0) {
                response = `${response} Error messages: ${errorMessages}`;
              }
            return createErrorResponse(400, response);
        }
    } catch (error) {
        console.log('Error with all providers:', error.message);
        return createErrorResponse(500, error.message);
    }

};

// Helper to handle fallback mechanism
const handleFallback = async (supportedNetwork, payload, flags) => {
    if(flags.fallback) {
        if(payload.method === 'eth_callFallback') {
            return createErrorResponse(400, 'Cannot specify eth_callFallback method with fallback flag. Use either eth_callFallback or the fallback flag.');
        }
        if(payload.method === 'eth_sendFallback') {
            return createErrorResponse(400, 'Cannot specify eth_sendFallback method with fallback flag. Use either eth_sendFallback or the fallback flag.');
        }
    }
            
    let fallbackPayload = payload;
    if(payload.method === 'eth_callFallback') {
        fallbackPayload = {
            jsonrpc: '2.0',
            method: 'eth_call',
            params: payload.params,
            id: payload.id || 1,
        }
    }
    if(payload.method === 'eth_sendFallback') {
        fallbackPayload = {
            jsonrpc: '2.0',
            method: 'eth_sendTransaction',
            params: payload.params,
            id: payload.id || 1,
        }
    }
    let latestErrorMessage = null;
    for (const provider of supportedNetwork.rpc) {
        const response = await sendRequest(provider, fallbackPayload, latestErrorMessage);
        if (response) {
            const body = JSON.parse(response.body);
            if(body.error) {
                if(process.env.NODE_ENV === 'development') {
                    console.log('Error with provider:', provider.url, body.error.message);
                }
                latestErrorMessage = body.error.message;
                continue;
            }
            if(process.env.NODE_ENV === 'development') console.log(response);
            return response;
        }
    }
    return createErrorResponse(500, latestErrorMessage || 'All RPC calls failed.');
};

// Helper to send an RPC request
const sendRequest = async (provider, payload, latestError = null) => {
    try {
        let headers = { 'Content-Type': 'application/json' };
        if (provider.credentials) {
            const authHeader = 'Basic ' + Buffer.from(`${provider.credentials.username}:${provider.credentials.password}`).toString('base64');
            headers['Authorization'] = authHeader;
        }
        const response = await axios.post(provider.url, payload, { headers });
        return createSuccessResponse(response.data);
    } catch (error) {
        console.error('Error with provider:', provider.url, error.message);
        latestError = error;
        return null;
    }
};

// Utility to create a success response
const createSuccessResponse = (data) => ({
    statusCode: 200,
    headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
});

// Utility to create an error response
const createErrorResponse = (statusCode, message) => ({
    statusCode,
    headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ error: message }),
});