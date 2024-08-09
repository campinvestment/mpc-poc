const { generateShares, createPartialSignature, combineSignatures } = require('./util');
const ethers = require('ethers');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const BN = require('bn.js');
const crypto = require('crypto');

const P = ec.curve.n;
const totalShares = 3;
const threshold = 2;

(async () => {
    try {
        const privateKey = new BN("some-private-key", 16);
        const publicKey = ec.g.mul(privateKey);
        console.log('Private Key:', privateKey.toString(16));
        console.log('Public Key:', publicKey.encode('hex'));

        const shares = generateShares(privateKey, totalShares, threshold);

        // Print shares
        shares.forEach((share, index) => {
            console.log(`Share ${index + 1}:`, share.y.toString(16));
        });

        // Create Ethereum address from public key
        const publicKeyBytes = publicKey.encode('array', false);  // false for uncompressed format
        const publicKeyHex = Buffer.from(publicKeyBytes).toString('hex');
        const address = ethers.computeAddress('0x' + publicKeyHex);
        console.log('Ethereum Address:', address);

        const receiver_address = "0x14BdDd8fCb538099eC3832f3Bc53CC657570374a";
        const rawTx = {
            to: receiver_address,
            value: ethers.parseEther('0.001'),
            gasLimit: 21000,
            maxFeePerGas: ethers.parseUnits('20', 'gwei'),
            maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
            nonce: 0,
            type: 2,
            chainId: 11155111,
        };

        // Create an unsigned transaction
        const unsignedTx = ethers.Transaction.from(rawTx);
        const unsignedSerializedTx = unsignedTx.unsignedSerialized;
        console.log('Unsigned Serialized Transaction:', unsignedSerializedTx);

        // Hash the transaction for signing
        const txHash = ethers.keccak256(unsignedSerializedTx);
        console.log('Transaction Hash:', txHash);

        const msgHash = txHash.slice(2); // Remove '0x' prefix
        const k = new BN(crypto.randomBytes(32)).mod(P); // In practice, this should be generated securely by all parties
        const selectedShares = shares.slice(0, threshold);

        // Create partial signatures
        const partialSignatures = selectedShares.map(share => 
            createPartialSignature(msgHash, share, k)
        );

        // Print partial signatures
        console.log('Partial Signatures:', partialSignatures.map(ps => ({ r: ps.r.toString(16), s: ps.s.toString(16) })));

        // Combine the partial signatures
        const signature = combineSignatures(partialSignatures, msgHash, publicKey);
        console.log('Combined Signature:', signature);

        // Verify the signature
        const recoveredAddress = ethers.recoverAddress(txHash, {
            r: signature.r,
            s: signature.s,
            v: signature.v + 27 // ethers expects v to be 27 or 28
        });
        console.log('Recovered Address:', recoveredAddress);
        console.log('Address matches:', recoveredAddress.toLowerCase() === address.toLowerCase());

        // Create a signed transaction
        const signedTx = ethers.Transaction.from({
            ...rawTx,
            signature: ethers.Signature.from({
                r: signature.r,
                s: signature.s,
                v: signature.v + 27
            })
        });

        // Serialize the signed transaction
        const serializedTx = signedTx.serialized;
        console.log('Signed Transaction:', serializedTx);

        // Verify the signed transaction
        const parsedTx = ethers.Transaction.from(serializedTx);
        console.log('Parsed Transaction:', parsedTx);
        console.log('Signer matches:', parsedTx.from.toLowerCase() === address.toLowerCase());

    } catch (error) {
        console.error('Error in signature combination or verification:', error);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
    }
})();