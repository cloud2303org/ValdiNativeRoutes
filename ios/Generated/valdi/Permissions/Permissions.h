//
// VRPermissionGrant.h
//

#import <ValdiRuntime/SCValdiMarshaller.h>

#import <PermissionsTypes/PermissionsTypes.h>


//
// VRPermissionsNativeModule.h
//

#import <ValdiRuntime/SCValdiMarshaller.h>

#import <PermissionsTypes/PermissionsTypes.h>

/**
* Marshall the instance into the given SCValdiMarshaller.
*/
FOUNDATION_EXPORT NSInteger VRPermissionsNativeModuleMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRPermissionsNativeModule> _Nonnull instance);


//
// VRPermissionsNativeModuleFactory.h
//

#import "PermissionsTypes.h"


//
// VRPermissionHost.h
//

#import <ValdiRuntime/SCValdiMarshaller.h>
#import <ValdiRuntime/SCValdiPromise.h>
#import <ValdiRuntime/SCValdiUndefinedValue.h>

#import <PermissionsTypes/PermissionsTypes.h>

/**
* Marshall the instance into the given SCValdiMarshaller.
*/
FOUNDATION_EXPORT NSInteger VRPermissionHostMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRPermissionHost> _Nonnull instance);


