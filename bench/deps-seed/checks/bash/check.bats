#!/usr/bin/env bats

@test "adds" {
    run bash check.sh 2 2
    [ "$status" -eq 0 ]
    [ "$output" = "4" ]
}
