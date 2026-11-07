#!/usr/bin/env python3
"""Compile/run the real OTA engine with cached JVM dependencies; no Gradle or downloads."""
import hashlib
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile

repo = Path(__file__).resolve().parents[4]
cache = Path(os.environ.get("GRADLE_USER_HOME", Path.home() / ".gradle")) / "caches/modules-2/files-2.1"
evidence = Path(os.environ.get("OTA_TEST_OUTPUT", Path(tempfile.gettempdir()) / "valdi-ota-client-tests/android"))
evidence.mkdir(parents=True, exist_ok=True)
out = Path(tempfile.mkdtemp(prefix="jvm-", dir=evidence))
full_only = os.environ.get("OTA_FULL_ONLY") == "1"


def run_logged(name, command, **kwargs):
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, **kwargs)
    (out / name).write_text(result.stdout)
    print(result.stdout, end="", flush=True)
    result.check_returncode()
    return result


native_library_dir = None
if not full_only:
    core = repo / "ota/native"
    if not (core / "ValdiOtaCodec.h").is_file():
        raise RuntimeError("Native core not ready. OTA_FULL_ONLY=1 runs full-file tests without JNI.")
    configured = os.environ.get("OTA_JNI_SOURCE")
    candidates = [Path(configured)] if configured else sorted((repo / "android/app/src/main/cpp").glob("*"))
    jni_source = next((p for p in candidates if p.suffix in (".c", ".cpp") and
                       "Java_io_valdiroutes_app_OtaNative_decode" in p.read_text()), None)
    if not jni_source:
        raise RuntimeError("Parent-owned OtaNative JNI source not ready; set OTA_JNI_SOURCE or use OTA_FULL_ONLY=1.")
    native_build = evidence / "native-host"
    run_logged("native-configure.log", ["cmake", "-S", str(core), "-B", str(native_build),
               "-DCMAKE_BUILD_TYPE=Release", "-DVALDI_OTA_BUILD_HOST_TESTS=OFF"])
    run_logged("native-build.log", ["cmake", "--build", str(native_build), "--target", "valdi_ota_core", "-j", "4"])
    java_settings = subprocess.run(["java", "-XshowSettings:properties", "-version"], capture_output=True, text=True, check=True)
    java_home = next(line.split("=", 1)[1].strip() for line in java_settings.stderr.splitlines() if "java.home =" in line)
    native_library_dir = out / "jni"
    native_library_dir.mkdir()
    mac = platform.system() == "Darwin"
    library = native_library_dir / ("libvaldi_ota_patch.dylib" if mac else "libvaldi_ota_patch.so")
    run_logged("jni-build.log", [
        "c++" if jni_source.suffix == ".cpp" else "cc",
        "-dynamiclib" if mac else "-shared", "-fPIC", "-O2",
        "-I" + str(Path(java_home) / "include"),
        "-I" + str(Path(java_home) / "include" / ("darwin" if mac else "linux")),
        "-I" + str(core), str(jni_source), str(native_build / "libvaldi_ota_core.a"), "-lz", "-o", str(library),
    ])
    (out / "native-inputs.sha256").write_text("".join(
        f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p}\n"
        for p in [jni_source, core / "CMakeLists.txt", *sorted(core.glob("*.c")), *sorted(core.glob("*.h")), library]
    ))


def jar(group, name, version):
    jars = sorted((cache / group / name / version).glob("*/*.jar"))
    jars = [p for p in jars if not p.name.endswith(("-sources.jar", "-javadoc.jar"))]
    if not jars:
        raise RuntimeError(f"Missing cached {group}:{name}:{version}")
    return jars[0]


stdlib = jar("org.jetbrains.kotlin", "kotlin-stdlib", "2.2.0")
compiler = [
    jar("org.jetbrains.kotlin", name, "2.2.0") for name in [
        "kotlin-compiler-embeddable", "kotlin-script-runtime",
        "kotlin-reflect", "kotlin-daemon-embeddable",
    ]
] + [
    stdlib,
    jar("org.jetbrains.intellij.deps", "trove4j", "1.0.20200330"),
    jar("org.jetbrains.kotlinx", "kotlinx-coroutines-core-jvm", "1.9.0"),
    jar("org.jetbrains", "annotations", "23.0.0"),
]
classpath = [
    stdlib,
    jar("org.jetbrains.kotlinx", "kotlinx-serialization-core-jvm", "1.9.0"),
    jar("org.jetbrains.kotlinx", "kotlinx-serialization-json-jvm", "1.9.0"),
    jar("junit", "junit", "4.13.2"),
    jar("org.hamcrest", "hamcrest-core", "1.3"),
]
source = repo / "android/app/src"
sources = [
    *sorted(p for p in (source / "main/java/io/valdiroutes/app/ota").glob("*.kt") if p.name != "ValdiOta.kt"),
    source / "test/java/io/valdiroutes/app/ValdiOtaClientTest.kt",
    source / "test/java/io/valdiroutes/app/ValdiOtaSplitTest.kt",
]
fixtures = out / "fixtures"
fixtures.mkdir()
hdiffz = os.environ.get("VALDI_HDIFFZ") or shutil.which("hdiffz")
if not hdiffz and (repo / "ota/tools/hdiffz").is_file():
    hdiffz = str(repo / "ota/tools/hdiffz")
if not full_only and not hdiffz:
    raise RuntimeError("Real patch tests require a local VALDI_HDIFFZ or hdiffz on PATH; no download is attempted.")
if not full_only:
    run_logged("fixtures.log", ["node", "--input-type=module", "-e", r"""
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {zstdCompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir=process.argv[1], hash=b=>createHash('sha256').update(b).digest('hex');
const packet=entries=>{
  const fields=[];
  for(const [name,body] of entries) for(const bytes of [Buffer.from(name),body]){
    const pad=(4-bytes.length%4)%4, size=Buffer.alloc(4);
    size.writeUInt32LE((bytes.length|(pad?0x80000000:0))>>>0);
    fields.push(size,bytes,Buffer.alloc(pad));
  }
  const body=Buffer.concat(fields), header=Buffer.alloc(8);
  header.writeUInt32LE(0x0100c633);header.writeUInt32LE(body.length,4);
  return Buffer.concat([header,body]);
};
let seed=1234;
const noise=Buffer.alloc(96*1024);
for(let i=0;i<noise.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;noise[i]=seed&255;}
const envelope=Buffer.from('34c60001c61fbc03c103191f63000000','hex');
const oldHbc=Buffer.concat([envelope,noise]);
const newHbc=Buffer.from(oldHbc);
newHbc.fill(17,300,600);newHbc.fill(18,6000,6100);
const base=new Map([['keep',Buffer.from('unchanged')],['entry.js',Buffer.from('old js')],
 ['deleted',Buffer.from('gone')],['res.assetcatalog',Buffer.from('old assets')]]);
const target=new Map([['res.assetcatalog',Buffer.from('new assets')],['keep',base.get('keep')],
 ['entry.js',Buffer.from('new js')],['new/file',Buffer.from('new content '.repeat(1000))],
 ['hash',Buffer.from('target hash')],['bytecode.js',newHbc]]);
base.set('bytecode.js',oldHbc);
writeFileSync(dir+'/old.hbc',oldHbc);writeFileSync(dir+'/new.hbc',newHbc);
const hdiffz=process.env.VALDI_HDIFFZ;
execFileSync(hdiffz,['-SD','-s-64','-c-zlib-6','-p-1',dir+'/old.hbc',dir+'/new.hbc',dir+'/patch.hdiff']);
const wrong=Buffer.from(newHbc);wrong[wrong.length-1]^=1;
writeFileSync(dir+'/wrong.hbc',wrong);
execFileSync(hdiffz,['-SD','-s-64','-c-zlib-6','-p-1',dir+'/old.hbc',dir+'/wrong.hbc',dir+'/wrong-output.hdiff']);
const old=packet(base), next=packet(target), oldZ=zstdCompressSync(old), nextZ=zstdCompressSync(next);
writeFileSync(dir+'/base.zst',oldZ);writeFileSync(dir+'/target.zst',nextZ);
const entries=[...target].map(([name,body])=>{
 const e={name,sha256:hash(body),size:body.length,operation:base.get(name)?.equals(body)?'copy':name==='bytecode.js'?'patch':'full'};
 if(e.operation==='full'){
   const z=zstdCompressSync(body), payload=z.length<body.length?z:body, encoding=payload===z?'zstd':'raw';
   const filename=hash(payload)+(encoding==='zstd'?'.zst':'.bin');
   writeFileSync(dir+'/'+filename,payload);
   e.download={path:'deltas/pages-001/payload/'+filename,sha256:hash(payload),size:payload.length,encoding};
 }
 if(e.operation==='patch'){
   const payload=readFileSync(dir+'/patch.hdiff'), filename=hash(payload)+'.hdiff';
   writeFileSync(dir+'/'+filename,payload);
   e.baseSha256=hash(oldHbc);
   e.download={path:'deltas/pages-001/payload/'+filename,sha256:hash(payload),size:payload.length,encoding:'hdiffpatch-zlib'};
 }
 return e;
});
writeFileSync(dir+'/fixture.json',JSON.stringify({schemaVersion:1,algorithm:'hdiffpatch',format:'HDIFFSF20',
 compression:'zlib',platform:'android',appVersion:'0.1',baseVersion:'pages-001',version:'target',
 baseSha256:hash(oldZ),targetSha256:hash(nextZ),basePacketSha256:hash(old),targetPacketSha256:hash(next),
 targetPacketSize:next.length,entries}));
const invalid=[
 ['magic',()=>{const b=Buffer.from(old);b.writeUInt32LE(0);return b;}],
 ['length',()=>{const b=Buffer.from(old);b.writeUInt32LE(b.length,4);return b;}],
 ['name-bounds',()=>{const b=Buffer.from(old);b.writeUInt32LE(0xffffffff,8);return b;}],
 ['content-bounds',()=>{const b=Buffer.from(old);b.writeUInt32LE(0xffffffff,16);return b;}],
 ['utf8',()=>{const b=Buffer.from(old);b[12]=0xc3;b[13]=0x28;return b;}],
 ['padding',()=>{const b=Buffer.from(old);b[29]=1;return b;}],
 ['traversal',()=>packet([['../escape',Buffer.from('x')]])],
 ['duplicate',()=>packet([['duplicate',Buffer.from('x')],['duplicate',Buffer.from('y')]])],
 ['count',()=>packet(Array.from({length:4097},(_,i)=>['entry'+i,Buffer.from('x')]))],
 ['truncated',()=>{const b=Buffer.concat([old,Buffer.from([1])]);b.writeUInt32LE(b.length-8,4);return b;}],
].map(([name,create])=>{
 const data=create(),file='bad-'+name+'.zst';writeFileSync(dir+'/'+file,zstdCompressSync(data));
 return {file,packetSha256:hash(data)};
});
writeFileSync(dir+'/bad-bases.json',JSON.stringify(invalid));
// Old entries omitted from the target must not retain their potentially huge names in Kotlin.
const manyNames=packet([...base,...Array.from({length:2048},(_,i)=>['deleted'+i+'ā'.repeat(13312),Buffer.alloc(0)])]);
writeFileSync(dir+'/many-names.zst',zstdCompressSync(manyNames));
writeFileSync(dir+'/many-names.sha256',hash(manyNames));
const driveTarget=packet([...target].map(([name,body])=>[name==='hash'?'C:/x':name,body]));
writeFileSync(dir+'/drive-target.zst',zstdCompressSync(driveTarget));
writeFileSync(dir+'/drive-target.sha256',hash(driveTarget));
// A packet larger than the entire test JVM heap: Kotlin must never materialize it.
const largeDir=dir+'/large';mkdirSync(largeDir);
const largeBody=Buffer.alloc(52*1024*1024,17), largeBase=new Map([['large',largeBody],['hash',Buffer.from('old')]]),
 largeTarget=new Map([['hash',Buffer.from('new')],['large',largeBody]]);
const largeOld=packet(largeBase),largeNext=packet(largeTarget),
 largeOldZ=zstdCompressSync(largeOld),largeNextZ=zstdCompressSync(largeNext),newHash=Buffer.from('new');
writeFileSync(largeDir+'/base.zst',largeOldZ);writeFileSync(largeDir+'/target.zst',largeNextZ);
const largePayload=hash(newHash)+'.bin';writeFileSync(largeDir+'/'+largePayload,newHash);
writeFileSync(largeDir+'/fixture.json',JSON.stringify({schemaVersion:1,algorithm:'hdiffpatch',format:'HDIFFSF20',
 compression:'zlib',platform:'android',appVersion:'0.1',baseVersion:'pages-001',version:'target',
 baseSha256:hash(largeOldZ),targetSha256:hash(largeNextZ),basePacketSha256:hash(largeOld),
 targetPacketSha256:hash(largeNext),targetPacketSize:largeNext.length,entries:[
 {name:'hash',sha256:hash(newHash),size:3,operation:'full',download:{path:'deltas/pages-001/payload/'+largePayload,
  sha256:hash(newHash),size:3,encoding:'raw'}},
 {name:'large',sha256:hash(largeBody),size:largeBody.length,operation:'copy'}]}));
""", str(fixtures)], env={**os.environ, "VALDI_HDIFFZ": hdiffz})
classes = out / "classes"
print("Evidence:", out, flush=True)
owned = [
    source / "main/java/io/valdiroutes/app/ota/ValdiOta.kt", *sources, Path(__file__).resolve(),
]
source_hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in owned}
(out / "compile-inputs.sha256").write_text("".join(
    f"{digest}  {p.relative_to(repo)}\n" for p, digest in source_hashes.items()
))
compiled = subprocess.run([
    "java", "-cp", os.pathsep.join(map(str, compiler)),
    "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler", "-no-stdlib", "-no-reflect",
    "-jvm-target", "17", "-classpath", os.pathsep.join(map(str, classpath)),
    "-d", str(classes), *map(str, sources),
], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
print(compiled.stdout, end="", flush=True)
(out / "compile.log").write_text(compiled.stdout)
compiled.check_returncode()
result = subprocess.run([
    "java", "--add-modules", "jdk.httpserver", "-Xmx48m",
    *([f"-Djava.library.path={native_library_dir}"] if native_library_dir else []),
    "-cp", os.pathsep.join(map(str, [classes, *classpath])),
    "org.junit.runner.JUnitCore", "io.valdiroutes.app.ValdiOtaClientTest",
    *([] if full_only else ["io.valdiroutes.app.ValdiOtaSplitTest"]),
], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env={**os.environ, "OTA_SPLIT_FIXTURES": str(fixtures)})
print(result.stdout, end="", flush=True)
(out / "tests.log").write_text(result.stdout)
result.check_returncode()
if not full_only:
    missing_library = out / "absent-library"
    missing_library.mkdir()
    run_logged("no-codec-tests.log", [
        "java", "--add-modules", "jdk.httpserver", "-Xmx48m",
        "-Djava.library.path=" + str(missing_library),
        "-cp", os.pathsep.join(map(str, [classes, *classpath])),
        "org.junit.runner.JUnitCore", "io.valdiroutes.app.ValdiOtaNoCodecTest",
    ], env={**os.environ, "OTA_SPLIT_FIXTURES": str(fixtures)})
for path, digest in source_hashes.items():
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise RuntimeError(f"Source changed during validation: {path}")
(out / "freeze.sha256").write_text((out / "compile-inputs.sha256").read_text())
