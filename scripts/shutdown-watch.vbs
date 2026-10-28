Option Explicit
Dim fso, shell, wmi, parentPid, player, audio, device, logPath, marker
Dim args, q, cmd, rc, mf, age

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
Set wmi = GetObject("winmgmts:")
Set args = WScript.Arguments

If args.Count < 5 Then WScript.Quit 2
parentPid = CLng(args(0))
player = args(1)
audio = args(2)
device = args(3)
logPath = args(4)
marker = ""
If args.Count >= 6 Then marker = args(5)

Sub WriteLog(text)
  On Error Resume Next
  If logPath <> "" Then
    Dim f
    Set f = fso.OpenTextFile(logPath, 8, True, 0)
    f.WriteLine Now & " [watcher-vbs] " & text
    f.Close
  End If
  On Error GoTo 0
End Sub

Function ProcessAlive(pid)
  ProcessAlive = False
  If pid <= 0 Then Exit Function
  On Error Resume Next
  Dim col
  Set col = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE ProcessId=" & pid)
  If Err.Number = 0 Then ProcessAlive = (col.Count > 0)
  Err.Clear
  On Error GoTo 0
End Function

WriteLog "start parent=" & parentPid
Do While ProcessAlive(parentPid)
  WScript.Sleep 500
Loop
WriteLog "parent-gone"
WScript.Sleep 450

If marker <> "" Then
  On Error Resume Next
  If fso.FileExists(marker) Then
    Set mf = fso.GetFile(marker)
    age = DateDiff("s", mf.DateLastModified, Now)
    If age >= 0 And age < 30 Then
      WriteLog "cleanup-marker-present skip"
      WScript.Quit 0
    End If
  End If
  On Error GoTo 0
End If

If Not fso.FileExists(player) Then
  WriteLog "player-missing"
  WScript.Quit 1
End If
If Not fso.FileExists(audio) Then
  WriteLog "audio-missing"
  WScript.Quit 1
End If

q = Chr(34)
device = Replace(device, q, "")
cmd = "powershell.exe -NoProfile -WindowStyle Hidden -STA -ExecutionPolicy Bypass -File " & q & player & q & " -Path " & q & audio & q & " -LogPath " & q & logPath & q & " -WaitDeviceMs 0"
If device <> "" Then cmd = cmd & " -Device " & q & device & q
WriteLog "player-start"
On Error Resume Next
rc = shell.Run(cmd, 0, True)
WriteLog "player-exit=" & rc
If Err.Number <> 0 Then
  WriteLog "player-error=" & Err.Description
  WScript.Quit 1
End If
WScript.Quit 0
