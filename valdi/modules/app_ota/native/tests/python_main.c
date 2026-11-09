/* Test-only embedding launcher: ASan must precede ctypes-loaded codec objects. */
#include <Python.h>

int main(int argc, char **argv) {
    return Py_BytesMain(argc, argv);
}
