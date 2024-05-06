const fse = require('fs-extra');

const transfer = () => {
    const srcDir = `artifacts/contracts`;
const destDir = `webapp/src/contracts`;
                                 
// To copy a folder or file, select overwrite accordingly
try {
  fse.copySync(srcDir, destDir, { overwrite: true })
  console.log('success!')
} catch (err) {
  console.error(err)
}
}

transfer();