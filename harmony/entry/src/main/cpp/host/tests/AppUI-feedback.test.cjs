const assert = require('node:assert/strict');
const test = require('node:test');
const {create} = require(process.env.APPUI_TEST_ADDON);
const turn = () => new Promise(resolve => setImmediate(resolve));
async function settle(session,promise) {
  let done=false;
  promise.then(()=>{done=true;},()=>{done=true;});
  for(let n=0;n<30&&!done;++n){session.flush();await turn();}
  assert(done,'native Future must settle');
  return promise;
}
function feedback(overrides={}) {
  const value={async showLoading(){},async hideLoading(){},async showToast(){},async hideToast(){},...overrides};
  return value;
}
function media() {
  return {
    setOwner(page,active){assert.equal(typeof page,'string');assert.equal(typeof active,'boolean');},
    close(){},
    async scanCode(){return {result:'typed scan 中文',scanType:'QR_CODE'};},
    async pickAttachments(source,limit,mimeTypes){
      assert.equal(source,'photos');assert.equal(limit,1);assert.deepEqual(mimeTypes,[]);
      return {canceled:false,assets:[{id:'asset-1',uri:'file:///cache/typed.png',name:'typed.png',mimeType:'image/png',size:123}]};
    },
    async clearAttachmentCache(){}
  };
}
test('four explicit methods use real Promise then and feedback receivers; void is undefined',async()=>{
  const calls=[];let thenCalls=0;
  const owner=feedback();
  for(const method of ['showLoading','hideLoading','showToast','hideToast'])owner[method]=function(...args){
    assert.equal(this,owner);calls.push([method,args]);
    const promise=Promise.resolve();
    promise.then=function(...handlers){assert.equal(this,promise);++thenCalls;return Promise.prototype.then.apply(this,handlers);};
    return promise;
  };
  const s=create(owner);
  try{
    const loading={title:'加载 中文\n"quoted"\0end',mask:true};
    const toast={title:'Done',icon:'success',duration:12,mask:false};
    for(const [method,request]of [['showLoading',loading],['hideLoading'],['showToast',toast],['hideToast']]){
      const result=s.call(method,request);assert(result instanceof Promise);
      assert.equal(await settle(s,result),undefined);
    }
    assert.deepEqual(calls,[['showLoading',[loading]],['hideLoading',[]],['showToast',[toast]],['hideToast',[]]]);
    assert.equal(thenCalls,4);
  }finally{s.control('close');}
});
test('rejection, non-Promise and synchronous SDK/ArkTS throws become rejected native Futures',async()=>{
  for(const implementation of [()=>Promise.reject(new Error('private token payload')),()=>42,()=>{throw Error('private');}]){
    const s=create(feedback({hideToast:implementation}));
    try{const promise=s.call('hideToast');await assert.rejects(settle(s,promise),/E_APP_UI_FEEDBACK/);}
    finally{s.control('close');}
  }
});
test('missing media owner rejects only the three SDK methods; other feedback remains usable',async()=>{
  const s=create(feedback());
  try{for(const method of ['scanCode','pickAttachments','clearAttachmentCache']){
    let promise;assert.doesNotThrow(()=>{promise=s.call(method);});assert(promise instanceof Promise);
    await assert.rejects(settle(s,promise),/E_APP_UI_MEDIA:typed SDK invocation failed/);
  }
    assert.equal(await settle(s,s.call('hideToast')),undefined);
  }finally{s.control('close');}
});
test('an explicitly invalid media owner fails mount validation rather than fabricating operation results',()=>{
  assert.throws(()=>create(feedback({media:{}})),/AppUI media requires typed SDK methods/);
});
test('explicit undefined media mounts like omission and leaves ordinary feedback usable',async()=>{
  const s=create(feedback({media:undefined}));
  try{
    assert.equal(await settle(s,s.call('hideToast')),undefined);
    for(const method of ['scanCode','pickAttachments','clearAttachmentCache'])
      await assert.rejects(settle(s,s.call(method)),/E_APP_UI_MEDIA:typed SDK invocation failed/);
  }finally{s.control('close');}
});
test('nonobject media values are rejected during native mount validation',()=>{
  for(const invalid of [null,42,'media',true,()=>{}])
    assert.throws(()=>create(feedback({media:invalid})),/AppUI media|E_APP_UI_FEEDBACK/);
});
test('feedback pending pin survives page removal; shutdown rejects once and late completion is harmless',async()=>{
  let resolve;
  const s=create(feedback({hideLoading(){return new Promise(yes=>{resolve=yes;});}}));
  const result=s.call('hideLoading');s.flush();assert.equal(s.control('detach'),false);
  let terminals=0;result.then(()=>++terminals,()=>++terminals);
  s.control('close');await assert.rejects(result,/E_APP_UI_CLOSED/);
  resolve();await turn();assert.equal(terminals,1);
});
test('generated modal Future keeps native ownership and edited typed result through page removal',async()=>{
  const s=create(feedback());
  try{
    const promise=s.call('showModal');s.flush();
    s.control('edit','edited 中文');assert.equal(s.control('detach'),false);
    s.control('confirm');assert.deepEqual(await settle(s,promise),{confirm:true,cancel:false,content:'edited 中文'});
  }finally{s.control('close');}
});
test('foreground identity change cancels native modal through the typed Promise path',async()=>{
  const s=create(feedback());
  try{const promise=s.call('showModal');s.flush();s.control('foreground','B');s.control('disappear');
    assert.deepEqual(await settle(s,promise),{confirm:false,cancel:true,content:'Default'});
  }finally{s.control('close');}
});
test('pending limit retires admission before completion; duplicate and late feedback settlements are inert',async()=>{
  const resolves=[];
  const s=create(feedback({hideToast(){return new Promise(yes=>resolves.push(yes));}}));
  try{
    const pending=Array.from({length:64},()=>s.call('hideToast'));
    s.flush();assert.equal(resolves.length,64);
    await assert.rejects(settle(s,s.call('hideToast')),/E_APP_UI_CAPACITY/);
    resolves[0]();await settle(s,pending[0]);
    const next=s.call('hideToast');s.flush();assert.equal(resolves.length,65);
    for(const resolve of resolves){resolve();resolve();}
    for(const promise of [...pending,next])assert.equal(await settle(s,promise),undefined);
  }finally{s.control('close');}
});
test('all 13 canonical c+ methods cross a real attached JavaScriptCore proxy as typed Promises',async()=>{
  const s=create(feedback({media:media()}));
  const modal={title:'Confirm',content:'Content',showCancel:true,confirmText:'Yes',cancelText:'No',
    editable:true,placeholderText:'Placeholder',defaultText:'Default'};
  const selection={title:'Pick',confirmText:'Yes',cancelText:'No'};
  const methods=[
    ['showModal',[modal],true,{confirm:false,cancel:true,content:'Default'}],
    ['showActionSheet',[{title:'Actions',itemList:['First','Second']}],true,{confirm:false,cancel:true,value:'',index:-1}],
    ['showPicker',[{...selection,value:'b',options:[{value:'a',label:'A'},{value:'b',label:'B'}]}],true,{confirm:false,cancel:true,value:'',index:-1}],
    ['showDatePicker',[{...selection,mode:'date',value:'2026-11-02',minYear:1901,maxYear:2100}],true,{confirm:false,cancel:true,value:'',index:-1}],
    ['showBottomSheet',[{...modal,dismissible:true}],true,{confirm:false,cancel:true,value:'',index:-1}],
    ['previewImage',[{current:'https://example.invalid/1.png',urls:['https://example.invalid/1.png']}],true,{confirm:true,cancel:false,value:'https://example.invalid/1.png',index:0}],
    ['showLoading',[{title:'Loading',mask:true}]],
    ['hideLoading',[]],
    ['showToast',[{title:'Done',icon:'success',duration:15,mask:false}]],
    ['hideToast',[]],
    ['scanCode',[],false,{result:'typed scan 中文',scanType:'QR_CODE'}],
    ['pickAttachments',['photos',1,[]],false,{canceled:false,assets:[
      {id:'asset-1',uri:'file:///cache/typed.png',name:'typed.png',mimeType:'image/png',size:123}]}],
    ['clearAttachmentCache',[]]
  ];
  try{
    assert.equal(s.eval('typeof __harmonyBusinessBootstrap.appUI.showModal'),'function');
    for(const [name,args,presentation,expected]of methods){
      assert.equal(s.eval(`globalThis.terminal='pending';globalThis.result=undefined;
        globalThis.promise=__harmonyBusinessBootstrap.appUI.${name}(...${JSON.stringify(args)});
        promise.then(v=>{globalThis.result=v;globalThis.terminal='ok';},
                     e=>{globalThis.result=String(e);globalThis.terminal='error';});
        promise instanceof Promise`),'true',name);
      s.flush();
      if(presentation){s.control('dismiss');s.flush();}
      for(let n=0;n<30&&s.eval('terminal')==='pending';++n){await turn();s.flush();}
      assert.equal(s.eval('terminal'),'ok',name);
      assert.equal(s.eval('JSON.stringify(result)'),expected?JSON.stringify(expected):'undefined',name);
    }
  }finally{s.control('close');}
});
test('synchronous overridden Promise then cannot settle a native request twice',async()=>{
  const s=create(feedback({hideToast(){
    const promise=Promise.resolve();
    promise.then=function(yes,no){yes();no(Error('late'));yes();throw Error('after settlement');};
    return promise;
  }}));
  try{assert.equal(await settle(s,s.call('hideToast')),undefined);}
  finally{s.control('close');}
});
test('real engine Promise callback survives Context removal through queued JS delivery',async()=>{
  const s=create(feedback());
  try{
    assert.equal(s.eval(`globalThis.terminal='pending';
      __harmonyBusinessBootstrap.appUI.showModal({
        title:'Confirm',content:'Content',showCancel:true,confirmText:'Yes',cancelText:'No',
        editable:true,placeholderText:'Placeholder',defaultText:'Default'
      }).then(v=>{globalThis.terminal=JSON.stringify(v);},e=>{globalThis.terminal=String(e);}); 'armed'`),'armed');
    s.flush();assert.equal(s.control('detach'),false);
    s.control('edit','after detach');s.control('confirm');s.flush();
    assert.equal(s.eval('terminal'),JSON.stringify({confirm:true,cancel:false,content:'after detach'}));
  }finally{s.control('close');}
});
