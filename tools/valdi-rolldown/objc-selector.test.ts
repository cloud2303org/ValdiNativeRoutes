import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { ObjCSelector } from './codegen/objc/ObjCSelector';

test('zero-argument resource release maps to an ARC-safe Objective-C selector', () => {
  const selector = new ObjCSelector('id', 'release', []);
  assert.equal(selector.selectorName, 'releaseObject');
  assert.equal(selector.makeCallString([]), 'releaseObject');
  assert.equal(new ObjCSelector('id', 'release', [{ name: 'id', type: 'NSString *' }]).selectorName, 'releaseWithId:');
  assert.equal(new ObjCSelector('id', 'play', []).selectorName, 'play');
});

test('generated release declaration is accepted with real NSObject under ARC', { skip: process.platform !== 'darwin' }, () => {
  const sdk = spawnSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' });
  assert.equal(sdk.status, 0, sdk.stderr);
  const selector = new ObjCSelector('id', 'release', []);
  const source = `#import <Foundation/Foundation.h>
@protocol Resource <NSObject>
${selector.messageDeclaration};
@end
@interface ResourceObject : NSObject <Resource>
@end
@implementation ResourceObject
${selector.messageDeclaration} { return nil; }
@end
`;
  const result = spawnSync('xcrun', [
    '--sdk', 'iphonesimulator', 'clang', '-x', 'objective-c', '-fobjc-arc', '-fsyntax-only',
    '-target', 'arm64-apple-ios16.0-simulator', '-isysroot', sdk.stdout.trim(), '-',
  ], { input: source, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
