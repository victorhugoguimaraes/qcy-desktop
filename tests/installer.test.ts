// @vitest-environment node
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { it, expect } from "vitest";
it.skipIf(process.platform !== "linux")("uma verificação reprovada interrompe a instalação e preserva o executável anterior", () => {
  const root = mkdtempSync(join(tmpdir(), "qcy-install-"));
  try {
    const bin = join(root, "bin"),
      data = join(root, "data"),
      app = join(data, "qcy-desktop");
    mkdirSync(bin);
    mkdirSync(app, { recursive: true });
    const old = join(app, "qcy-desktop");
    writeFileSync(old, "versão anterior");
    writeFileSync(
      join(bin, "npm"),
      '#!/bin/sh\nif [ "$1 $2" = "run check" ]; then echo TESTE_REPROVADO; exit 42; fi\nexit 0\n',
      { mode: 0o755 },
    );
    writeFileSync(join(bin, "cargo"), "#!/bin/sh\nexit 43\n", { mode: 0o755 });
    const result = spawnSync("bash", ["scripts/install-linux.sh"], {
      env: {
        ...process.env,
        XDG_DATA_HOME: data,
        PATH: `${bin}:${process.env.PATH}`,
      },
      encoding: "utf8",
    });
    expect(result.status).toBe(42);
    expect(result.stdout).toContain("TESTE_REPROVADO");
    expect(readFileSync(old, "utf8")).toBe("versão anterior");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it.skipIf(process.platform !== 'linux')('compila o executável com a interface embutida',()=>{
 const root=mkdtempSync(join(tmpdir(),'qcy-production-'));try{
  const bin=join(root,'bin');mkdirSync(bin);
  writeFileSync(join(bin,'npm'),'#!/bin/sh\nexit 0\n',{mode:0o755});
  writeFileSync(join(bin,'cargo'),'#!/bin/sh\nprintf "%s\\n" "$*"\nexit 43\n',{mode:0o755});
  const result=spawnSync('bash',['scripts/install-linux.sh'],{env:{...process.env,XDG_DATA_HOME:join(root,'data'),PATH:`${bin}:${process.env.PATH}`},encoding:'utf8'});
  expect(result.status).toBe(43);expect(result.stdout).toContain('build --release --features custom-protocol');
 }finally{rmSync(root,{recursive:true,force:true})}
});
