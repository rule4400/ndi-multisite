!macro customInstall
  ExecWait 'netsh advfirewall firewall add rule name="NDI Multisite TCP" dir=in action=allow protocol=TCP localport=5960-5969'
  ExecWait 'netsh advfirewall firewall add rule name="NDI Multisite UDP" dir=in action=allow protocol=UDP localport=5960-5969'
  ExecWait 'netsh advfirewall firewall add rule name="NDI Multisite Discovery" dir=in action=allow protocol=TCP localport=5990'
  ExecWait 'netsh advfirewall firewall add rule name="NDI Multisite mDNS" dir=in action=allow protocol=UDP localport=5353'
!macroend

!macro customUnInstall
  ExecWait 'netsh advfirewall firewall delete rule name="NDI Multisite TCP"'
  ExecWait 'netsh advfirewall firewall delete rule name="NDI Multisite UDP"'
  ExecWait 'netsh advfirewall firewall delete rule name="NDI Multisite Discovery"'
  ExecWait 'netsh advfirewall firewall delete rule name="NDI Multisite mDNS"'
!macroend
