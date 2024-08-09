const BN = require('bn.js');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const crypto = require('crypto');
const ethers = require('ethers');

const P = ec.curve.n;

function generatePolynomial(secret, degree) {
    const coeff = [new BN(secret)];
    for (let i = 1; i <= degree; i++) {
        coeff.push(new BN(crypto.randomBytes(32)).mod(P));
    }
    return coeff;
}

function evaluatePolynomial(coeff, x) {
    let y = new BN(0);
    for (let i = 0; i < coeff.length; i++) {
        y = y.add(coeff[i].mul(new BN(x).pow(new BN(i)))).mod(P);
    }
    return y;
}

function generateShares(secret, n, t) {
    const coeff = generatePolynomial(secret, t - 1);
    const shares = [];
    for (let i = 1; i <= n; i++) {
        shares.push({ x: i, y: evaluatePolynomial(coeff, i) });
    }
    return shares;
}

//------------------- partial signing -------------------

function createPartialSignature(msgHash, share, k) {
    const messageHashBN = new BN(msgHash, 16);
    const r = ec.g.mul(k).getX().umod(P);
    const kInv = k.invm(P);
    const s = kInv.mul(messageHashBN.add(share.y.mul(r))).umod(P);
    return { r, s };
}

//------------------- combine signatures -------------------

function lagrangeInterpolation(shares, x) {
    let result = new BN(0);
    for (let i = 0; i < shares.length; i++) {
        let li = new BN(1);
        for (let j = 0; j < shares.length; j++) {
            if (i !== j) {
                li = li.mul(x.sub(new BN(shares[j].x)))
                    .mul(new BN(shares[i].x).sub(new BN(shares[j].x)).invm(P))
                    .mod(P);
            }
        }
        result = result.add(shares[i].y.mul(li)).mod(P);
    }
    return result;
}

function combineSignatures(partialSigs, msgHash, publicKey) {
    const P = ec.curve.n;
    const halfOrder = P.shrn(1);
    
    // Combine the partial signatures
    const r = partialSigs[0].r;
    let s = lagrangeInterpolation(partialSigs.map((sig, i) => ({ x: new BN(i + 1), y: sig.s })), new BN(0));
    
    // Ensure s is positive and in the lower half of the curve order (canonical form)
    s = s.umod(P);
    if (s.gt(halfOrder)) {
        s = P.sub(s);
    }
    
    console.log('Debug - r:', r.toString(16));
    console.log('Debug - s:', s.toString(16));
    console.log('Debug - msgHash:', msgHash);

    const messageHashBN = new BN(msgHash, 16);

    // Recover v
    let v;
    for (let i = 0; i < 2; i++) {
        try {
            const recoveredPubKey = ec.recoverPubKey(messageHashBN, { r, s }, i);
            console.log(`Debug - Recovered public key for i=${i}:`, recoveredPubKey.encode('hex'));
            console.log(`Debug - Original public key:`, publicKey.encode('hex'));
            if (recoveredPubKey.getX().eq(publicKey.getX()) && recoveredPubKey.getY().eq(publicKey.getY())) {
                v = i;
                break;
            }
        } catch (error) {
            console.warn(`Recovery attempt failed for i=${i}: ${error.message}`);
        }
    }
    
    if (v === undefined) {
        throw new Error("Failed to recover the correct public key");
    }
    
    // Convert r and s to hex strings with '0x' prefix
    const rHex = '0x' + r.toString(16).padStart(64, '0');
    const sHex = '0x' + s.toString(16).padStart(64, '0');
    
    return { r: rHex, s: sHex, v };
}

module.exports = {
    generateShares, 
    combineSignatures,
    createPartialSignature,
};