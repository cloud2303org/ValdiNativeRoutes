package com.snap.valdi.promise

interface Promise<T>
class ResolvablePromise<T> : Promise<T> {
    var value: T? = null
    var error: Exception? = null
}
