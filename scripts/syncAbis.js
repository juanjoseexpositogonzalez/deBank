const fs = require("fs");
const path = require("path");

const CONTRACTS = [
  "Token",
  "dBank",
  "StrategyRouter",
  "ConfigManager",
  "MockS1",
];

const root = path.resolve(__dirname, "..");
const artifactsDir = path.join(root, "artifacts", "contracts");
const targetDir = path.join(root, "src", "abis");

const readArtifact = (contractName) => {
  const artifactPath = path.join(
    artifactsDir,
    `${contractName}.sol`,
    `${contractName}.json`
  );
  const raw = fs.readFileSync(artifactPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed.abi) {
    throw new Error(`ABI not found in ${artifactPath}`);
  }
  return parsed.abi;
};

const writeAbi = (contractName, abi) => {
  const outPath = path.join(targetDir, `${contractName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(abi, null, 2));
  return outPath;
};

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const main = () => {
  ensureDir(targetDir);
  const outputs = CONTRACTS.map((name) => {
    const abi = readArtifact(name);
    return writeAbi(name, abi);
  });

  console.log("ABIs sincronizados:");
  outputs.forEach((out) => console.log(`  - ${out}`));
};

main();
