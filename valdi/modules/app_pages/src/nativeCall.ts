// Every host call returns a Promise native created: page code hands native no function, so a call outlives the page
// that made it (a page-created callback is disposed with that page, see Valdi's advanced-native-references.md).

// Android rejects with `ClassName: 'message'` (valdi's Throwable.messageWithCauses); iOS keeps the message as is.
const ANDROID_FAILURE = /^[\w$.]+: '([\s\S]*)'$/;

function unwrap(error: unknown): unknown {
  const match = error instanceof Error ? ANDROID_FAILURE.exec(error.message) : null;
  return match ? new Error(match[1]) : error;
}

/** Runs one host call: a synchronous throw (no host installed) rejects like a native failure. */
export function nativeCall<T>(start: () => Promise<T>): Promise<T> {
  let promise: Promise<T>;
  try {
    promise = start();
  } catch (error) {
    return Promise.reject(error);
  }
  return promise.catch(error => {
    throw unwrap(error);
  });
}
