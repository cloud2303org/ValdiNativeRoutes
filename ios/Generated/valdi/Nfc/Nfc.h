//
// VRNfcAvailability.h
//

#import <ValdiRuntime/SCValdiMarshaller.h>

#import <NfcTypes/NfcTypes.h>


//
// VRNfcHandle.h
//

#import <ValdiRuntime/SCValdiMarshaller.h>

#import <NfcTypes/NfcTypes.h>


//
// VRNfcHostEvents.h
//

#import <ValdiRuntime/SCValdiMarshaller.h>

#import <NfcTypes/NfcTypes.h>


//
// VRNfcNativeModule.h
//

#import <ValdiRuntime/SCValdiMarshaller.h>

#import <NfcTypes/NfcTypes.h>

/**
* Marshall the instance into the given SCValdiMarshaller.
*/
FOUNDATION_EXPORT NSInteger VRNfcNativeModuleMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRNfcNativeModule> _Nonnull instance);


//
// VRNfcNativeModuleFactory.h
//

#import "NfcTypes.h"


//
// VRNfcRecord.h
//

#import <ValdiRuntime/SCValdiMarshaller.h>

#import <NfcTypes/NfcTypes.h>


//
// VRNfcTag.h
//

#import <ValdiRuntime/SCValdiMarshaller.h>

#import <NfcTypes/NfcTypes.h>


//
// VRNfcHost.h
//

#import <ValdiRuntime/SCValdiMarshaller.h>
#import <ValdiRuntime/SCValdiPromise.h>
#import <ValdiRuntime/SCValdiUndefinedValue.h>

#import <NfcTypes/NfcTypes.h>

/**
* Marshall the instance into the given SCValdiMarshaller.
*/
FOUNDATION_EXPORT NSInteger VRNfcHostMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRNfcHost> _Nonnull instance);


