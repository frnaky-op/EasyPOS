package com.easypos.companion;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

@CapacitorPlugin(name = "EasyPOSUpdater")
public class UpdateInstallerPlugin extends Plugin {
    private static final long MAX_APK_SIZE = 200L * 1024L * 1024L;

    @PluginMethod
    public void install(PluginCall call) {
        String urlText = call.getString("url");
        String expectedSha = call.getString("sha256");
        Integer expectedVersion = call.getInt("versionCode");
        Long expectedSize = call.getLong("size");
        if (urlText == null || expectedSha == null || !expectedSha.matches("[a-f0-9]{64}") ||
            expectedVersion == null || expectedVersion < 1 || expectedSize == null || expectedSize < 1 || expectedSize > MAX_APK_SIZE) {
            call.reject("Invalid update details.");
            return;
        }

        try {
            URL url = new URL(urlText);
            if ((!"http".equals(url.getProtocol()) && !"https".equals(url.getProtocol())) ||
                !"/download/android".equals(url.getPath()) || url.getQuery() != null || url.getRef() != null) {
                call.reject("Invalid update address.");
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
                getBridge().executeOnMainThread(() -> {
                    try {
                        Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getContext().getPackageName()));
                        getActivity().startActivity(settings);
                        JSObject result = new JSObject();
                        result.put("status", "permission_required");
                        call.resolve(result);
                    } catch (Exception error) { call.reject("Could not open install settings: " + error.getMessage()); }
                });
                return;
            }
            getBridge().execute(() -> downloadAndInstall(call, url, expectedSha, expectedVersion, expectedSize));
        } catch (Exception error) {
            call.reject("Could not start the update: " + error.getMessage());
        }
    }

    private void downloadAndInstall(PluginCall call, URL url, String expectedSha, int expectedVersion, long expectedSize) {
        HttpURLConnection connection = null;
        File temporary = null;
        try {
            File directory = new File(getContext().getCacheDir(), "updates");
            if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Update cache unavailable");
            temporary = new File(directory, "EasyPOS-Mobile.part.apk");
            File downloaded = new File(directory, "EasyPOS-Mobile.apk");
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(30000);
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) throw new IllegalStateException("Download failed");
            long announced = connection.getContentLengthLong();
            if (announced > MAX_APK_SIZE || (announced > 0 && announced != expectedSize)) throw new IllegalStateException("Wrong update size");
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long received = 0;
            long lastProgress = 0;
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temporary)) {
                byte[] buffer = new byte[65536];
                int amount;
                while ((amount = input.read(buffer)) != -1) {
                    received += amount;
                    if (received > MAX_APK_SIZE || received > expectedSize) throw new IllegalStateException("Update too large");
                    output.write(buffer, 0, amount);
                    digest.update(buffer, 0, amount);
                    if (received - lastProgress >= 512 * 1024 || received == expectedSize) {
                        JSObject progress = new JSObject();
                        progress.put("received", received);
                        progress.put("total", expectedSize);
                        notifyListeners("downloadProgress", progress);
                        lastProgress = received;
                    }
                }
            }
            if (received != expectedSize || !hex(digest.digest()).equals(expectedSha)) throw new IllegalStateException("Update checksum mismatch");
            PackageInfo archive = getContext().getPackageManager().getPackageArchiveInfo(temporary.getAbsolutePath(), 0);
            if (archive == null || !getContext().getPackageName().equals(archive.packageName) || versionCode(archive) != expectedVersion ||
                expectedVersion <= installedVersionCode()) throw new IllegalStateException("Wrong application or version");
            if (downloaded.exists() && !downloaded.delete()) throw new IllegalStateException("Could not replace cached update");
            if (!temporary.renameTo(downloaded)) throw new IllegalStateException("Could not prepare update");
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", downloaded);
            getBridge().executeOnMainThread(() -> {
                try {
                    Intent installer = new Intent(Intent.ACTION_VIEW);
                    installer.setDataAndType(uri, "application/vnd.android.package-archive");
                    installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    getActivity().startActivity(installer);
                    JSObject result = new JSObject();
                    result.put("status", "installer_opened");
                    call.resolve(result);
                } catch (Exception error) { call.reject("Could not open Android installer: " + error.getMessage()); }
            });
        } catch (Exception error) {
            if (temporary != null) temporary.delete();
            call.reject("Update failed: " + error.getMessage());
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private long installedVersionCode() throws Exception {
        PackageInfo installed = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
        return versionCode(installed);
    }

    private long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    private String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format("%02x", value & 0xff));
        return result.toString();
    }
}
