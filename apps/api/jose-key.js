"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JoseKey = void 0;
const jose_1 = require("jose");
const jwk_1 = require("@atproto/jwk");
const util_1 = require("./util");
const secp = require("@noble/secp256k1");
const crypto = require("node:crypto");

secp.utils.sha256Sync = (message) => {
    return new Uint8Array(crypto.createHash('sha256').update(message).digest());
};
secp.utils.hmacSha256Sync = (key, ...messages) => {
    const hmac = crypto.createHmac('sha256', key);
    messages.map(m => hmac.update(m));
    return new Uint8Array(hmac.digest());
};

const { JOSEError } = jose_1.errors;

function base64urlEncode(buffer) {
    return Buffer.from(buffer).toString('base64url');
}

function base64urlDecode(str) {
    return new Uint8Array(Buffer.from(str, 'base64url'));
}

function sha256(data) {
    return secp.utils.sha256Sync(data);
}

async function signES256K(payload, header, privateKeyJwk) {
    const privateKeyBytes = base64urlDecode(privateKeyJwk.d);

    const encodedHeader = base64urlEncode(
        new TextEncoder().encode(JSON.stringify(header))
    );
    const encodedPayload = base64urlEncode(
        new TextEncoder().encode(JSON.stringify(payload))
    );

    const message = `${encodedHeader}.${encodedPayload}`;
    const messageHash = sha256(new TextEncoder().encode(message));

    const signature = await secp.sign(messageHash, privateKeyBytes, {
        canonical: true,
        der: false
    });
    const encodedSignature = base64urlEncode(signature);

    return `${message}.${encodedSignature}`;
}

async function verifyES256K(token, publicKeyJwk, options) {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');

    if (!encodedHeader || !encodedPayload || !encodedSignature) {
        throw new Error('Invalid JWT format');
    }

    const message = `${encodedHeader}.${encodedPayload}`;
    const messageHash = sha256(new TextEncoder().encode(message));

    // Convert JWK to raw public key (uncompressed format: 0x04 + x + y)
    const x = base64urlDecode(publicKeyJwk.x);
    const y = base64urlDecode(publicKeyJwk.y);
    const publicKey = new Uint8Array([0x04, ...x, ...y]);

    const signature = base64urlDecode(encodedSignature);

    const isValid = secp.verify(signature, messageHash, publicKey);

    if (!isValid) {
        throw new Error('Invalid signature');
    }

    // Parse header and payload
    const header = JSON.parse(new TextDecoder().decode(base64urlDecode(encodedHeader)));
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(encodedPayload)));

    // Validate claims if options provided
    if (options) {
        const now = Math.floor(Date.now() / 1000);

        if (options.audience && payload.aud !== options.audience) {
            throw new Error('Invalid audience');
        }

        if (options.issuer && payload.iss !== options.issuer) {
            throw new Error('Invalid issuer');
        }

        if (payload.exp && payload.exp < now) {
            throw new Error('Token expired');
        }

        if (payload.nbf && payload.nbf > now) {
            throw new Error('Token not yet valid');
        }
    }

    return {
        protectedHeader: header,
        payload: payload,
    };
}

function isES256K(alg) {
    return alg === 'ES256K';
}

class JoseKey extends jwk_1.Key {
    /**
     * Some runtimes (e.g. Bun) require an `alg` second argument to be set when
     * invoking `importJWK`. In order to be compatible with these runtimes, we
     * provide the following method to ensure the `alg` is always set. We also
     * take the opportunity to ensure that the `alg` is compatible with this key.
     */
    async getKeyObj(alg) {
        console.log('>> io le alg', alg);
        if (!this.algorithms.includes(alg)) {
            throw new jwk_1.JwkError(`Key cannot be used with algorithm "${alg}"`);
        }

        // For ES256K, return the JWK directly as we'll handle signing/verification separately
        if (isES256K(alg)) {
            return this.jwk;
        }

        try {
            return await (0, jose_1.importJWK)(this.jwk, alg.replaceAll('K', ''));
        }
        catch (cause) {
            throw new jwk_1.JwkError('Failed to import JWK', undefined, { cause });
        }
    }

    async createJwt(header, payload) {
        try {
            const { kid } = header;
            if (kid && kid !== this.kid) {
                throw new jwk_1.JwtCreateError(`Invalid "kid" (${kid}) used to sign with key "${this.kid}"`);
            }

            const { alg } = header;
            if (!alg) {
                throw new jwk_1.JwtCreateError('Missing "alg" in JWT header');
            }

            // Handle ES256K separately
            if (isES256K(alg)) {
                const fullHeader = {
                    ...header,
                    alg,
                    kid: this.kid,
                };
                return await signES256K(payload, fullHeader, this.jwk);
            }

            const keyObj = await this.getKeyObj(alg);
            const jwtBuilder = new jose_1.SignJWT(payload).setProtectedHeader({
                ...header,
                alg,
                kid: this.kid,
            });
            const signedJwt = await jwtBuilder.sign(keyObj);
            return signedJwt;
        }
        catch (cause) {
            if (cause instanceof JOSEError) {
                throw new jwk_1.JwtCreateError(cause.message, cause.code, { cause });
            }
            else {
                throw jwk_1.JwtCreateError.from(cause);
            }
        }
    }

    async verifyJwt(token, options) {
        try {
            // Check if token uses ES256K by decoding header
            const headerB64 = token.split('.')[0];
            const headerJson = JSON.parse(
                Buffer.from(headerB64, 'base64url').toString()
            );

            // Handle ES256K separately
            if (isES256K(headerJson.alg)) {
                const result = await verifyES256K(token, this.jwk, options);

                const headerParsed = jwk_1.jwtHeaderSchema.safeParse(result.protectedHeader);
                if (!headerParsed.success) {
                    throw new jwk_1.JwtVerifyError('Invalid JWT header', undefined, {
                        cause: headerParsed.error,
                    });
                }

                const payloadParsed = jwk_1.jwtPayloadSchema.safeParse(result.payload);
                if (!payloadParsed.success) {
                    throw new jwk_1.JwtVerifyError('Invalid JWT payload', undefined, {
                        cause: payloadParsed.error,
                    });
                }

                return {
                    protectedHeader: headerParsed.data,
                    payload: payloadParsed.data,
                };
            }

            const result = await (0, jose_1.jwtVerify)(
                token,
                async ({ alg }) => this.getKeyObj(alg),
                { ...options, algorithms: this.algorithms }
            );

            const headerParsed = jwk_1.jwtHeaderSchema.safeParse(result.protectedHeader);
            if (!headerParsed.success) {
                throw new jwk_1.JwtVerifyError('Invalid JWT header', undefined, {
                    cause: headerParsed.error,
                });
            }

            const payloadParsed = jwk_1.jwtPayloadSchema.safeParse(result.payload);
            if (!payloadParsed.success) {
                throw new jwk_1.JwtVerifyError('Invalid JWT payload', undefined, {
                    cause: payloadParsed.error,
                });
            }

            return {
                protectedHeader: headerParsed.data,
                payload: payloadParsed.data,
            };
        }
        catch (cause) {
            if (cause instanceof JOSEError) {
                throw new jwk_1.JwtVerifyError(cause.message, cause.code, { cause });
            }
            else {
                throw jwk_1.JwtVerifyError.from(cause);
            }
        }
    }

    static async generateKeyPair(allowedAlgos, options) {
        if (allowedAlgos === undefined) allowedAlgos = ['ES256'];

        if (!allowedAlgos.length) {
            throw new jwk_1.JwkError('No algorithms provided for key generation');
        }

        // Handle ES256K key generation
        if (allowedAlgos.includes('ES256K')) {
            const privateKey = secp.utils.randomPrivateKey();
            const publicKey = secp.getPublicKey(privateKey, false); // uncompressed

            const x = publicKey.slice(1, 33);
            const y = publicKey.slice(33, 65);

            const privateJwk = {
                kty: 'EC',
                crv: 'secp256k1',
                x: base64urlEncode(x),
                y: base64urlEncode(y),
                d: base64urlEncode(privateKey),
            };

            const publicJwk = {
                kty: 'EC',
                crv: 'secp256k1',
                x: base64urlEncode(x),
                y: base64urlEncode(y),
            };

            return {
                privateKey: privateJwk,
                publicKey: publicJwk,
            };
        }

        const errors = [];
        for (const alg of allowedAlgos) {
            try {
                return await (0, jose_1.generateKeyPair)(alg, options);
            }
            catch (err) {
                errors.push(err);
            }
        }
        throw new jwk_1.JwkError('Failed to generate key pair', undefined, {
            cause: new AggregateError(errors, 'None of the algorithms worked'),
        });
    }

    static async generate(allowedAlgos, kid, options) {
        if (allowedAlgos === undefined) allowedAlgos = ['ES256'];

        const kp = await this.generateKeyPair(allowedAlgos, {
            ...options,
            extractable: true,
        });
        return this.fromImportable(kp.privateKey, kid);
    }

    static async fromImportable(input, kid) {
        if (typeof input === 'string') {
            if (input.startsWith('-----')) {
                return this.fromPKCS8(input, '', kid);
            }
            if (input.startsWith('{')) {
                return this.fromJWK(input, kid);
            }
            throw new jwk_1.JwkError('Invalid input');
        }
        if (typeof input === 'object') {
            if ('kty' in input || 'alg' in input) {
                return this.fromJWK(input, kid);
            }
            return this.fromKeyLike(input, kid);
        }
        throw new jwk_1.JwkError('Invalid input');
    }

    static async fromKeyLike(keyLike, kid, alg) {
        const jwk = await (0, jose_1.exportJWK)(keyLike);
        if (alg) {
            if (!jwk.alg) jwk.alg = alg;
            else if (jwk.alg !== alg) throw new jwk_1.JwkError('Invalid "alg" in JWK');
        }
        return this.fromJWK(jwk, kid);
    }

    static async fromPKCS8(pem, alg, kid) {
        const keyLike = await (0, jose_1.importPKCS8)(pem, alg, { extractable: true });
        return this.fromKeyLike(keyLike, kid);
    }

    static async fromJWK(input, inputKid) {
        const jwk = typeof input === 'string' ? JSON.parse(input) : input;
        if (!jwk || typeof jwk !== 'object') throw new jwk_1.JwkError('Invalid JWK');
        const kid = (0, util_1.either)(jwk.kid, inputKid);
        const use = jwk.use || 'sig';
        return new JoseKey(jwk_1.jwkValidator.parse({ ...jwk, kid, use }));
    }
}

exports.JoseKey = JoseKey;