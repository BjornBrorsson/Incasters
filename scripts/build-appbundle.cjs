/**
 * Incasters - Automated Android App Bundle (.aab) Build Script
 * 
 * Compiles production web assets, synchronizes the Capacitor Android project,
 * verifies/generates signing keystores, and executes Gradle bundleRelease
 * to produce a Google Play Store-ready Android App Bundle (.aab).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const ANDROID_DIR = path.join(ROOT_DIR, 'android');
const APP_DIR = path.join(ANDROID_DIR, 'app');
const KEYSTORE_PATH = path.join(APP_DIR, 'release.keystore');
const OUTPUT_AAB_GRADLE = path.join(APP_DIR, 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
const RELEASE_DIR = path.join(ROOT_DIR, 'release', 'android');
const DEST_AAB_NAME = 'Incasters-Release.aab';

console.log('\n======================================================');
console.log('   Incasters - Google Play App Bundle (.aab) Builder   ');
console.log('======================================================\n');

// 1. Check for Java / JDK environment
function detectJava() {
  // Check if java is already in PATH
  try {
    const versionOutput = execSync('java -version 2>&1', { encoding: 'utf8' });
    const firstLine = versionOutput.split('\n')[0] || '';
    console.log(`✓ Java detected in PATH: ${firstLine.trim()}`);
    return true;
  } catch (e) {
    // Search common installation directories
  }

  const candidateDirs = [];
  if (process.env.JAVA_HOME) {
    candidateDirs.push(path.join(process.env.JAVA_HOME, 'bin'));
  }

  if (process.platform === 'win32') {
    const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const localApp = process.env['LOCALAPPDATA'] || '';
    candidateDirs.push(
      path.join(progFiles, 'Android', 'Android Studio', 'jbr', 'bin'),
      path.join(progFiles, 'Android', 'Android Studio', 'jre', 'bin'),
      path.join(localApp, 'Programs', 'Android Studio', 'jbr', 'bin')
    );
    // Scan Program Files\Java and Eclipse Adoptium
    const javaRoot = path.join(progFiles, 'Java');
    if (fs.existsSync(javaRoot)) {
      fs.readdirSync(javaRoot).forEach(dir => candidateDirs.push(path.join(javaRoot, dir, 'bin')));
    }
    const adoptiumRoot = path.join(progFiles, 'Eclipse Adoptium');
    if (fs.existsSync(adoptiumRoot)) {
      fs.readdirSync(adoptiumRoot).forEach(dir => candidateDirs.push(path.join(adoptiumRoot, dir, 'bin')));
    }
  } else if (process.platform === 'darwin') {
    candidateDirs.push(
      '/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin',
      '/Library/Java/Home/bin'
    );
  } else {
    candidateDirs.push(
      '/usr/lib/jvm/default-java/bin',
      '/usr/lib/jvm/java-21-openjdk-amd64/bin',
      '/usr/lib/jvm/java-17-openjdk-amd64/bin'
    );
  }

  for (const binDir of candidateDirs) {
    const javaExe = path.join(binDir, process.platform === 'win32' ? 'java.exe' : 'java');
    if (fs.existsSync(javaExe)) {
      console.log(`✓ Located Java at: ${javaExe}`);
      process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;
      process.env.JAVA_HOME = path.dirname(binDir);
      return true;
    }
  }

  return false;
}

// 2. Check for Android SDK / local.properties
function setupAndroidSdk() {
  const localPropsPath = path.join(ANDROID_DIR, 'local.properties');
  if (fs.existsSync(localPropsPath)) {
    console.log('✓ Android local.properties found.');
    return true;
  }

  let sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;

  if (!sdkDir) {
    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
      const defaultWin = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
      if (fs.existsSync(defaultWin)) sdkDir = defaultWin;
    } else if (process.platform === 'darwin' && process.env.HOME) {
      const defaultMac = path.join(process.env.HOME, 'Library', 'Android', 'sdk');
      if (fs.existsSync(defaultMac)) sdkDir = defaultMac;
    } else if (process.env.HOME) {
      const defaultLinux = path.join(process.env.HOME, 'Android', 'Sdk');
      if (fs.existsSync(defaultLinux)) sdkDir = defaultLinux;
    }
  }

  if (sdkDir && fs.existsSync(sdkDir)) {
    const escaped = sdkDir.replace(/\\/g, '\\\\');
    fs.writeFileSync(localPropsPath, `sdk.dir=${escaped}\n`);
    console.log(`✓ Auto-generated local.properties with sdk.dir=${sdkDir}`);
    return true;
  }

  return false;
}

// Check environment
const hasJava = detectJava();
const hasSdk = setupAndroidSdk();

if (!hasJava) {
  console.error('\n❌ ERROR: Java JDK (version 17 or 21) was not found.');
  console.error('To build an Android App Bundle locally:');
  console.error('  1. Install JDK 21 from https://adoptium.net or install Android Studio.');
  console.error('  2. Ensure JAVA_HOME is set in your environment variables.');
  console.error('\nNOTE: Your GitHub Actions CI/CD automatically builds and signs the .aab bundle');
  console.error('on every push to main or release tag in a pre-configured Ubuntu cloud runner!\n');
  process.exit(1);
}

// 3. Ensure release keystore exists
if (!fs.existsSync(KEYSTORE_PATH)) {
  console.log('\n[1/5] Release keystore not found. Generating persistent keystore...');
  execSync(`node "${path.join(ROOT_DIR, 'scripts', 'generate-keystore.cjs')}"`, { stdio: 'inherit', cwd: ROOT_DIR });
} else {
  console.log('\n[1/5] ✓ Release keystore verified at android/app/release.keystore');
}

// 4. Compile web assets
console.log('\n[2/5] Compiling TypeScript & Building Web Assets (npm run build)...');
execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });

// 5. Sync Capacitor Android project
console.log('\n[3/5] Synchronizing Capacitor Android assets (npx cap sync android)...');
execSync('npx cap sync android', { stdio: 'inherit', cwd: ROOT_DIR });

// 6. Execute Gradle bundleRelease
console.log('\n[4/5] Executing Gradle bundleRelease (Packaging signed .aab)...');
const isWindows = process.platform === 'win32';
const gradlewCmd = isWindows ? 'gradlew.bat bundleRelease' : './gradlew bundleRelease';

try {
  execSync(gradlewCmd, {
    stdio: 'inherit',
    cwd: ANDROID_DIR,
    env: {
      ...process.env,
      KEYSTORE_PATH: 'release.keystore',
      KEYSTORE_PASSWORD: process.env.KEYSTORE_PASSWORD || 'incastersrelease',
      KEY_ALIAS: process.env.KEY_ALIAS || 'incasters-key',
      KEY_PASSWORD: process.env.KEY_PASSWORD || 'incastersrelease',
      VERSION_CODE: process.env.VERSION_CODE || '100'
    }
  });
} catch (err) {
  console.error('\n❌ Gradle build failed.');
  process.exit(1);
}

// 7. Verify and copy output bundle
if (!fs.existsSync(OUTPUT_AAB_GRADLE)) {
  console.error(`\n❌ Error: Output bundle not found at: ${OUTPUT_AAB_GRADLE}`);
  process.exit(1);
}

if (!fs.existsSync(RELEASE_DIR)) {
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
}

const rootDest = path.join(ROOT_DIR, DEST_AAB_NAME);
const releaseDest = path.join(RELEASE_DIR, DEST_AAB_NAME);

fs.copyFileSync(OUTPUT_AAB_GRADLE, rootDest);
fs.copyFileSync(OUTPUT_AAB_GRADLE, releaseDest);

const stats = fs.statSync(rootDest);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
const fileBuffer = fs.readFileSync(rootDest);
const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

console.log('\n======================================================');
console.log('   🎉 SUCCESS! Android App Bundle (.aab) Created!     ');
console.log('======================================================');
console.log(`\n📦 Bundle Path:      ${rootDest}`);
console.log(`📁 Release Path:     ${releaseDest}`);
console.log(`⚖️  Bundle Size:      ${sizeMb} MB (${stats.size} bytes)`);
console.log(`🔒 SHA256 Checksum:  ${sha256}`);

console.log('\n📋 Google Play Store Publishing Instructions:');
console.log('  1. Go to Google Play Console: https://play.google.com/console');
console.log('  2. Select your app: "Incasters" (Package: com.incasters.game)');
console.log('  3. Navigate to "Testing" -> "Internal testing" or "Production"');
console.log('  4. Click "Create new release"');
console.log(`  5. Upload "${DEST_AAB_NAME}"`);
console.log('  6. Add release notes and click "Save" -> "Review release" -> "Start rollout"!\n');
