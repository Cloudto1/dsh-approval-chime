' dsh-approval-chime native toast activation shim. ASCII only.
'
' WHAT THIS IS: the protocol-handler entry Windows starts when the user clicks
' the toast's "accept"/"reject" button (rev-25 interface freeze page under docs/,
' sections 2 and 3.1). It is registered as
'   "<SystemRoot>\System32\wscript.exe" "<this file>" "%1"
' and WScript.Arguments(0) is the full activation URI.
'
' WHY wscript AND NOT powershell.exe DIRECTLY: wscript.exe is a GUI-subsystem
' host, so no console window is ever created; the PowerShell child is then started
' with WScript.Shell.Run(cmd, 0, False), i.e. SW_HIDE. Registering
' "powershell.exe -WindowStyle Hidden ..." instead would flash a console window,
' because Explorer creates the console before the child can hide it (section 2.1).
'
' The worker path is resolved relative to THIS file, so the activation keeps
' working if the plugin directory moves - the registry value is written from the
' same place by install.ps1, and both then agree without a second install step.
Dim fso, uri, ps1, cmd, re
uri = ""
If WScript.Arguments.Count > 0 Then uri = WScript.Arguments(0)

' WHITELIST BEFORE ANY USE. The URI is user-visible data (it lives in Action
' Center) and this script splices it into a command line, so a quote, a backslash,
' whitespace or a control character must never reach that line: a quote would end
' the quoted argument and let the rest of the string start something else. Anything
' outside the frozen shape quits with code 2 and starts nothing.
Set re = New RegExp
re.Pattern = "^dsh-approval-chime://answer/\?[A-Za-z0-9%&=.?/_-]*$"
If Not re.Test(uri) Then WScript.Quit 2

Set fso = CreateObject("Scripting.FileSystemObject")
ps1 = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "answer.ps1")
cmd = """C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & ps1 & """ -Uri """ & uri & """"
CreateObject("WScript.Shell").Run cmd, 0, False
