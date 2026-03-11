Output demo/demo.gif

Set Shell "zsh"
Set FontSize 20
Set Width 1200
Set Height 600
Set Theme "Dracula"
Set WindowBar Colorful
Set BorderRadius 8
Set Padding 20
Set TypingSpeed 50ms
Set CursorBlink false

Hide
Type `alias superghost="bun run src/cli.ts"`
Enter
Sleep 500ms
Show

Type "cat demo/tests.yaml"
Enter
Sleep 3s

Type "superghost --config demo/tests.yaml"
Enter

Sleep 10s
