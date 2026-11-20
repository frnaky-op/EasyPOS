!macro customInstall
  ; The desktop API stays on loopback. Only the paired mobile service on 3211
  ; is reachable, from machines on the same local subnet.
  nsExec::ExecToStack '"$SYSDIR\netsh.exe" advfirewall firewall show rule name="EasyPOS Mobile - Local Network"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    ExecShell "runas" "$SYSDIR\netsh.exe" 'advfirewall firewall add rule name="EasyPOS Mobile - Local Network" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" protocol=TCP localport=3211 remoteip=localsubnet profile=any enable=yes'
  ${EndIf}
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    ExecShell "runas" "$SYSDIR\netsh.exe" 'advfirewall firewall delete rule name="EasyPOS Mobile - Local Network" program="$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  ${EndIf}
!macroend
