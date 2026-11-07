//
// VROtaInfo.h
//

#import <ValdiRuntime/SCValdiMarshaller.h>

#import <app_otaTypes/app_otaTypes.h>


//
// VROtaNativeModule.h
//

#import <ValdiRuntime/SCValdiMarshaller.h>

#import <app_otaTypes/app_otaTypes.h>

/**
* Marshall the instance into the given SCValdiMarshaller.
*/
FOUNDATION_EXPORT NSInteger VROtaNativeModuleMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VROtaNativeModule> _Nonnull instance);


//
// VROtaNativeModuleFactory.h
//

#import "app_otaTypes.h"


//
// VROtaHost.h
//

#import <ValdiRuntime/SCValdiMarshaller.h>
#import <ValdiRuntime/SCValdiPromise.h>

#import <app_otaTypes/app_otaTypes.h>

/**
* Marshall the instance into the given SCValdiMarshaller.
*/
FOUNDATION_EXPORT NSInteger VROtaHostMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VROtaHost> _Nonnull instance);


