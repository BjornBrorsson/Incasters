const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

console.log('Generating RSA 2048-bit key pair...');
const keys = forge.pki.rsa.generateKeyPair(2048);

console.log('Creating self-signed X.509 certificate...');
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(16));

// Valid for 30 years
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 30);

const attrs = [
  { name: 'commonName', value: 'Incasters' },
  { name: 'organizationName', value: 'Incasters Game Studio' },
  { name: 'organizationalUnitName', value: 'Game Development' },
  { name: 'localityName', value: 'Stockholm' },
  { name: 'stateOrProvinceName', value: 'Stockholm' },
  { name: 'countryName', value: 'SE' }
];

cert.setSubject(attrs);
cert.setIssuer(attrs);

cert.setExtensions([
  {
    name: 'basicConstraints',
    cA: true
  },
  {
    name: 'keyUsage',
    keyCertSign: true,
    digitalSignature: true,
    nonRepudiation: true,
    keyEncipherment: true,
    dataEncipherment: true
  }
]);

// Self-sign with SHA-256
cert.sign(keys.privateKey, forge.md.sha256.create());

console.log('Packaging into PKCS#12 / Android Keystore bundle...');
const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
  keys.privateKey,
  [cert],
  'incastersrelease',
  {
    algorithm: '3des',
    friendlyName: 'incasters-key',
    generateLocalKeyId: true
  }
);

const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
const p12Buffer = Buffer.from(p12Der, 'binary');

const outDir = path.resolve(__dirname, '../android/app');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outPath = path.join(outDir, 'release.keystore');
fs.writeFileSync(outPath, p12Buffer);

console.log(`✓ Permanent release keystore written to: ${outPath} (${p12Buffer.length} bytes)`);
