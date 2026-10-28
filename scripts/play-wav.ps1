param(
  [string]$Path,
  [string]$Device = "",
  [switch]$ListDevices
)
$ErrorActionPreference = 'Stop'

function Get-RenderDevices {
  $root = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render'
  $devices = @()
  foreach ($key in Get-ChildItem $root -ErrorAction SilentlyContinue) {
    $state = (Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue).DeviceState
    if (($state -band 1) -ne 1) { continue }
    $props = Get-ItemProperty (Join-Path $key.PSPath 'Properties') -ErrorAction SilentlyContinue
    $name = [string]$props.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    $devices += [pscustomobject]@{
      id = '{0.0.0.00000000}.' + $key.PSChildName
      name = $name
    }
  }
  return $devices
}

if ($ListDevices) {
  @(Get-RenderDevices) | ConvertTo-Json -Compress
  exit 0
}
if ([string]::IsNullOrWhiteSpace($Path)) { throw 'Path is required' }

# No device selected: keep the original zero-dependency SoundPlayer path.
if ([string]::IsNullOrWhiteSpace($Device)) {
  $p = New-Object System.Media.SoundPlayer($Path)
  $p.PlaySync()
  $p.Dispose()
  exit 0
}

$Device = $Device.Trim()
$DeviceId = $Device
if (-not $Device.StartsWith('{0.0.0.')) {
  $devices = @(Get-RenderDevices)
  $match = $devices | Where-Object { $_.name -eq $Device } | Select-Object -First 1
  if (-not $match) {
    $match = $devices | Where-Object { $_.name -like "*$Device*" } | Select-Object -First 1
  }
  if (-not $match) { throw "Audio device not found: $Device" }
  $DeviceId = $match.id
}

Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Threading;
using System.Runtime.InteropServices;
public enum DshEDataFlow { eRender = 0, eCapture = 1, eAll = 2 }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class DshMMDeviceEnumeratorComObject { }
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IDshMMDeviceEnumerator {
  [PreserveSig] int EnumAudioEndpoints(DshEDataFlow dataFlow, int stateMask, out IntPtr devices);
  [PreserveSig] int GetDefaultAudioEndpoint(DshEDataFlow dataFlow, int role, out IDshMMDevice endpoint);
  [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IDshMMDevice device);
  [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr pClient);
  [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr pClient);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IDshMMDevice {
  [PreserveSig] int Activate(ref Guid iid, uint dwClsCtx, IntPtr pActivationParams, out IntPtr ppInterface);
  [PreserveSig] int OpenPropertyStore(uint stgmAccess, out IntPtr properties);
  [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  [PreserveSig] int GetState(out int state);
}
[StructLayout(LayoutKind.Sequential, Pack=1)]
public struct DshWaveFormatEx {
  public ushort wFormatTag;
  public ushort nChannels;
  public uint nSamplesPerSec;
  public uint nAvgBytesPerSec;
  public ushort nBlockAlign;
  public ushort wBitsPerSample;
  public ushort cbSize;
}
[ComImport, Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IDshAudioClient {
  [PreserveSig] int Initialize(int shareMode, uint streamFlags, long hnsBufferDuration, long hnsPeriodicity, ref DshWaveFormatEx format, IntPtr audioSessionGuid);
  [PreserveSig] int GetBufferSize(out uint bufferFrames);
  [PreserveSig] int GetStreamLatency(out long latency);
  [PreserveSig] int GetCurrentPadding(out uint padding);
  [PreserveSig] int IsFormatSupported(int shareMode, ref DshWaveFormatEx format, out IntPtr closestMatch);
  [PreserveSig] int GetMixFormat(out IntPtr deviceFormat);
  [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
  [PreserveSig] int Start();
  [PreserveSig] int Stop();
  [PreserveSig] int Reset();
  [PreserveSig] int SetEventHandle(IntPtr eventHandle);
  [PreserveSig] int GetService(ref Guid riid, out IntPtr ppv);
}
[ComImport, Guid("F294ACFC-3146-4483-A7BF-ADDCA7C260E2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IDshAudioRenderClient {
  [PreserveSig] int GetBuffer(uint numFramesRequested, out IntPtr ppData);
  [PreserveSig] int ReleaseBuffer(uint numFramesWritten, uint flags);
}
public static class DshWasapiPlayer {
  const uint AUTOCONVERT = 0x80000000u | 0x08000000u;
  public static void Play(string deviceId, string wavPath) {
    byte[] raw = File.ReadAllBytes(wavPath);
    if (raw.Length < 44 || System.Text.Encoding.ASCII.GetString(raw, 0, 4) != "RIFF" || System.Text.Encoding.ASCII.GetString(raw, 8, 4) != "WAVE") {
      throw new Exception("not RIFF/WAVE");
    }
    int off = 12, dataOff = -1, dataSize = 0;
    ushort channels = 0, bits = 0, blockAlign = 0;
    uint sampleRate = 0;
    while (off + 8 <= raw.Length) {
      string id = System.Text.Encoding.ASCII.GetString(raw, off, 4);
      int size = BitConverter.ToInt32(raw, off + 4);
      int body = off + 8;
      if (id == "fmt ") {
        channels = BitConverter.ToUInt16(raw, body + 2);
        sampleRate = BitConverter.ToUInt32(raw, body + 4);
        blockAlign = BitConverter.ToUInt16(raw, body + 12);
        bits = BitConverter.ToUInt16(raw, body + 14);
      } else if (id == "data") {
        dataOff = body;
        dataSize = Math.Min(size, raw.Length - body);
        break;
      }
      off = body + size + (size % 2);
    }
    if (dataOff < 0 || channels == 0 || sampleRate == 0 || blockAlign == 0) throw new Exception("invalid wav");
    byte[] pcm = new byte[dataSize];
    Buffer.BlockCopy(raw, dataOff, pcm, 0, dataSize);

    var enumerator = (IDshMMDeviceEnumerator)new DshMMDeviceEnumeratorComObject();
    IDshMMDevice device;
    int hr = enumerator.GetDevice(deviceId, out device);
    if (hr != 0 || device == null) throw new Exception("GetDevice hr=" + hr);
    var format = new DshWaveFormatEx {
      wFormatTag = 1,
      nChannels = channels,
      nSamplesPerSec = sampleRate,
      nAvgBytesPerSec = sampleRate * (uint)blockAlign,
      nBlockAlign = blockAlign,
      wBitsPerSample = bits,
      cbSize = 0
    };
    Guid clientIid = new Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2");
    IntPtr clientPtr;
    hr = device.Activate(ref clientIid, 0x17, IntPtr.Zero, out clientPtr);
    if (hr != 0) throw new Exception("Activate hr=" + hr);
    var client = (IDshAudioClient)Marshal.GetObjectForIUnknown(clientPtr);
    hr = client.Initialize(0, AUTOCONVERT, 2000000, 0, ref format, IntPtr.Zero);
    if (hr != 0) throw new Exception("Initialize hr=0x" + hr.ToString("X8"));
    uint bufferFrames;
    hr = client.GetBufferSize(out bufferFrames);
    if (hr != 0) throw new Exception("GetBufferSize hr=" + hr);
    Guid renderIid = new Guid("F294ACFC-3146-4483-A7BF-ADDCA7C260E2");
    IntPtr renderPtr;
    hr = client.GetService(ref renderIid, out renderPtr);
    if (hr != 0) throw new Exception("GetService hr=" + hr);
    var render = (IDshAudioRenderClient)Marshal.GetObjectForIUnknown(renderPtr);
    hr = client.Start();
    if (hr != 0) throw new Exception("Start hr=" + hr);
    int totalFrames = pcm.Length / blockAlign;
    int done = 0;
    while (done < totalFrames) {
      uint padding;
      hr = client.GetCurrentPadding(out padding);
      if (hr != 0) throw new Exception("GetCurrentPadding hr=" + hr);
      uint available = bufferFrames - padding;
      if (available == 0) { Thread.Sleep(5); continue; }
      uint take = (uint)Math.Min((int)available, totalFrames - done);
      IntPtr destination;
      hr = render.GetBuffer(take, out destination);
      if (hr != 0) throw new Exception("GetBuffer hr=" + hr);
      Marshal.Copy(pcm, done * blockAlign, destination, (int)take * blockAlign);
      hr = render.ReleaseBuffer(take, 0);
      if (hr != 0) throw new Exception("ReleaseBuffer hr=" + hr);
      done += (int)take;
      Thread.Sleep(5);
    }
    for (int i = 0; i < 300; i++) {
      uint padding;
      if (client.GetCurrentPadding(out padding) != 0 || padding == 0) break;
      Thread.Sleep(10);
    }
    client.Stop();
    Marshal.ReleaseComObject(render);
    Marshal.Release(renderPtr);
    Marshal.ReleaseComObject(client);
    Marshal.Release(clientPtr);
    Marshal.ReleaseComObject(device);
    Marshal.ReleaseComObject(enumerator);
  }
}
'@

[DshWasapiPlayer]::Play($DeviceId, $Path)
