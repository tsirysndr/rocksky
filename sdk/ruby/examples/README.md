# Examples

Native-core (over the shared Rust engine):

```sh
../build-core.sh                       # build the native lib
ruby -Ilib examples/native_core.rb     # read-only tour; write side shown inline
```

Remote control (a controllable player + a remote UI that drives it):

```sh
ruby -Ilib examples/remote_control.rb <ACCESS_TOKEN>
```
