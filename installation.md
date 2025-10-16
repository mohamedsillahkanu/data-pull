# DHIS2 Installation Guide - Complete Working Steps

**Successfully installed DHIS2 2.40.5 on DigitalOcean**  
**Date:** October 10, 2025  
**Server IP:** 192.34.63.53  
**Access URL:** http://192.34.63.53:8080/dhis

---

## Table of Contents

1. [Server Requirements](#server-requirements)
2. [Server Setup](#server-setup)
3. [System Update](#system-update)
4. [Install Java](#install-java)
5. [Install PostgreSQL](#install-postgresql)
6. [Install Tomcat](#install-tomcat)
7. [Configure DHIS2](#configure-dhis2)
8. [Deploy DHIS2](#deploy-dhis2)
9. [Access DHIS2](#access-dhis2)
10. [Troubleshooting](#troubleshooting)
11. [Maintenance Commands](#maintenance-commands)

---

## Server Requirements

### Minimum Specifications:
- **OS:** Ubuntu 22.04 LTS
- **RAM:** 4GB (minimum 2GB, but 4GB recommended)
- **CPU:** 2 vCPUs
- **Storage:** 50GB SSD
- **Provider:** DigitalOcean, AWS, Google Cloud, or Azure

### Cost:
- **DigitalOcean:** $24/month (4GB RAM)
- **AWS:** ~$15-20/month (t3.medium)

---

## Server Setup

### Step 1: Create DigitalOcean Droplet

1. Sign up at https://www.digitalocean.com/
2. Click **"Create"** → **"Droplets"**
3. Choose:
   - **Image:** Ubuntu 22.04 (LTS) x64
   - **Plan:** Basic - $24/month (4 GB RAM / 2 vCPUs / 80 GB SSD)
   - **Datacenter:** Select closest region
   - **Authentication:** Password
   - **Hostname:** dhis2-server
4. Click **"Create Droplet"**
5. Note your server IP address (e.g., 192.34.63.53)

### Step 2: Connect via SSH

```bash
# From Windows PowerShell, Mac Terminal, or Linux
ssh root@YOUR_SERVER_IP

# Example:
ssh root@192.34.63.53
```

---

## System Update

```bash
# Update package lists
apt update

# Upgrade installed packages
apt upgrade -y
```

**Note:** If prompted about SSH configuration, select "install the package maintainer's version"

---

## Install Java

```bash
# Install Java 17
apt install -y openjdk-17-jdk

# Verify installation
java -version
```

**Expected output:** openjdk version "17.x.x"

---

## Install PostgreSQL

```bash
# Install PostgreSQL with PostGIS extensions
apt install -y postgresql postgresql-contrib postgresql-postgis

# Start and enable PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Verify status
systemctl status postgresql
```

### Create Database and User

```bash
# Create DHIS2 database
sudo -u postgres psql <<EOF
CREATE USER dhis WITH PASSWORD 'Dhis2Database2024';
CREATE DATABASE dhis2 WITH OWNER dhis;
\c dhis2
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
GRANT ALL PRIVILEGES ON DATABASE dhis2 TO dhis;
EOF
```

**Important:** Change 'Dhis2Database2024' to your own secure password!

---

## Install Tomcat

### Step 1: Create Tomcat User

```bash
useradd -r -m -U -d /opt/tomcat -s /bin/false tomcat
```

### Step 2: Download and Extract Tomcat

```bash
cd /tmp
wget https://archive.apache.org/dist/tomcat/tomcat-9/v9.0.95/bin/apache-tomcat-9.0.95.tar.gz
tar xzvf apache-tomcat-9.0.95.tar.gz -C /opt/tomcat --strip-components=1
```

### Step 3: Set Permissions

```bash
chown -R tomcat:tomcat /opt/tomcat
chmod -R u+x /opt/tomcat/bin
```

### Step 4: Configure Tomcat Memory Settings

```bash
cat > /opt/tomcat/bin/setenv.sh <<'EOF'
#!/bin/bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export CATALINA_OPTS="-Xms1024m -Xmx3072m -XX:+UseG1GC"
export DHIS2_HOME=/opt/dhis2
EOF

chmod +x /opt/tomcat/bin/setenv.sh
```

**Memory Settings:**
- Initial heap: 1GB (-Xms1024m)
- Maximum heap: 3GB (-Xmx3072m)
- For 4GB server, leave 1GB for OS

### Step 5: Create Systemd Service

```bash
cat > /etc/systemd/system/tomcat.service <<'EOF'
[Unit]
Description=Apache Tomcat Web Application Container
After=network.target postgresql.service

[Service]
Type=forking
User=tomcat
Group=tomcat

Environment="JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64"
Environment="CATALINA_PID=/opt/tomcat/temp/tomcat.pid"
Environment="CATALINA_HOME=/opt/tomcat"
Environment="CATALINA_BASE=/opt/tomcat"

ExecStart=/opt/tomcat/bin/startup.sh
ExecStop=/opt/tomcat/bin/shutdown.sh

RestartSec=10
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
```

### Step 6: Enable and Start Tomcat

```bash
systemctl daemon-reload
systemctl enable tomcat
systemctl start tomcat
systemctl status tomcat
```

---

## Configure DHIS2

### Step 1: Create DHIS2 Directories

```bash
mkdir -p /opt/dhis2/files
chown -R tomcat:tomcat /opt/dhis2
```

### Step 2: Create DHIS2 Configuration File

```bash
cat > /opt/dhis2/dhis.conf <<'EOF'
connection.dialect = org.hibernate.dialect.PostgreSQLDialect
connection.driver_class = org.postgresql.Driver
connection.url = jdbc:postgresql:dhis2
connection.username = dhis
connection.password = Dhis2Database2024

server.base.url = http://192.34.63.53:8080/dhis

filestore.provider = filesystem
filestore.container = files

encryption.password = RandomKey123456789
EOF

chown tomcat:tomcat /opt/dhis2/dhis.conf
chmod 600 /opt/dhis2/dhis.conf
```

**Important Configuration Notes:**
- Replace password with your actual database password
- Replace IP address with your server IP
- Use `files` (not `/opt/dhis2/files`) for filestore.container
- Generate secure encryption password: `openssl rand -base64 32`

---

## Deploy DHIS2

### Step 1: Download DHIS2

```bash
cd /tmp
wget https://releases.dhis2.org/2.40/dhis2-stable-2.40.5.war
```

### Step 2: Deploy to Tomcat

```bash
# Stop Tomcat
systemctl stop tomcat

# Copy WAR file
cp /tmp/dhis2-stable-2.40.5.war /opt/tomcat/webapps/dhis.war

# Set correct permissions
chown tomcat:tomcat /opt/tomcat/webapps/dhis.war
chmod 644 /opt/tomcat/webapps/dhis.war

# Start Tomcat
systemctl start tomcat
```

### Step 3: Monitor Deployment

```bash
# Watch deployment logs (takes 5-10 minutes)
tail -f /opt/tomcat/logs/catalina.out
```

**Look for:**
- "Deploying web application archive [/opt/tomcat/webapps/dhis.war]"
- "Deployment of web application...has finished"
- "Server startup in [XXXX] milliseconds"

**Press Ctrl+C to exit log viewer**

---

## Configure Firewall

```bash
# Install firewall
apt install -y ufw

# Allow SSH and HTTP
ufw allow OpenSSH
ufw allow 8080/tcp

# Enable firewall
ufw enable

# Check status
ufw status
```

---

## Access DHIS2

### Step 1: Open Browser

Wait 2-3 minutes after seeing "Deployment...finished", then:

1. Open web browser (Chrome, Firefox, Edge)
2. Go to: `http://YOUR_SERVER_IP:8080/dhis`
3. Example: `http://192.34.63.53:8080/dhis`

### Step 2: Login

```
Username: admin
Password: district
```

### Step 3: Change Password Immediately! 🚨

**CRITICAL SECURITY STEP:**

1. Click profile icon (top right corner)
2. Click "Edit user profile"
3. Click "Change password"
4. Current password: `district`
5. New password: Create STRONG password
6. Confirm password
7. Click "Save"

---

## Troubleshooting

### DHIS2 Won't Start - Check Memory

```bash
# Check available memory
free -h

# If less than 4GB total, increase memory allocation
# or reduce Tomcat heap size in setenv.sh
```

### PostgreSQL Not Running

```bash
# Start PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Check status
systemctl status postgresql
```

### Tomcat Not Running

```bash
# Check status
systemctl status tomcat

# View logs
tail -100 /opt/tomcat/logs/catalina.out

# Restart Tomcat
systemctl restart tomcat
```

### Can't Access DHIS2 (404 Error)

```bash
# Check if dhis.war exists
ls -lh /opt/tomcat/webapps/

# Check if deployment succeeded
grep -i "dhis" /opt/tomcat/logs/catalina.out | tail -20

# If dhis.war missing, redeploy
cp /tmp/dhis2-stable-2.40.5.war /opt/tomcat/webapps/dhis.war
chown tomcat:tomcat /opt/tomcat/webapps/dhis.war
systemctl restart tomcat
```

### Connection Refused in Browser

```bash
# Check firewall
ufw status

# Ensure port 8080 is open
ufw allow 8080/tcp

# Check if Tomcat is listening
netstat -tulpn | grep 8080
```

### Configuration File Issues

**Common Error:** Container name cannot contain / or \

**Solution:** Use relative path for filestore.container

```bash
# Correct configuration:
filestore.container = files

# Incorrect (causes error):
filestore.container = /opt/dhis2/files
```

---

## Maintenance Commands

### Check System Status

```bash
# Check Tomcat status
systemctl status tomcat

# Check PostgreSQL status
systemctl status postgresql

# Check memory usage
free -h

# Check disk space
df -h
```

### View Logs

```bash
# View Tomcat logs
tail -f /opt/tomcat/logs/catalina.out

# View last 100 lines
tail -100 /opt/tomcat/logs/catalina.out

# Search for errors
grep -i "error\|exception" /opt/tomcat/logs/catalina.out | tail -20
```

### Restart Services

```bash
# Restart DHIS2 (Tomcat)
systemctl restart tomcat

# Restart PostgreSQL
systemctl restart postgresql

# Restart both
systemctl restart postgresql tomcat
```

### Backup Database

```bash
# Create backup
sudo -u postgres pg_dump dhis2 > /tmp/dhis2_backup_$(date +%Y%m%d).sql

# Backup with compression
sudo -u postgres pg_dump dhis2 | gzip > /tmp/dhis2_backup_$(date +%Y%m%d).sql.gz
```

### Restore Database

```bash
# Stop Tomcat first
systemctl stop tomcat

# Restore database
sudo -u postgres psql dhis2 < /tmp/dhis2_backup_20251010.sql

# Start Tomcat
systemctl start tomcat
```

### Update DHIS2

```bash
# Stop Tomcat
systemctl stop tomcat

# Backup current installation
cp /opt/tomcat/webapps/dhis.war /tmp/dhis.war.backup

# Download new version
cd /tmp
wget https://releases.dhis2.org/2.40/dhis2-stable-2.40.X.war

# Replace WAR file
cp dhis2-stable-2.40.X.war /opt/tomcat/webapps/dhis.war
chown tomcat:tomcat /opt/tomcat/webapps/dhis.war

# Start Tomcat
systemctl start tomcat

# Monitor upgrade
tail -f /opt/tomcat/logs/catalina.out
```

---

## Performance Tuning

### For 4GB RAM Server

```bash
# Edit setenv.sh
nano /opt/tomcat/bin/setenv.sh

# Use these settings:
export CATALINA_OPTS="-Xms1024m -Xmx3072m -XX:+UseG1GC"
```

### For 8GB RAM Server

```bash
# Edit setenv.sh
nano /opt/tomcat/bin/setenv.sh

# Use these settings:
export CATALINA_OPTS="-Xms2048m -Xmx6144m -XX:+UseG1GC"
```

### PostgreSQL Optimization

```bash
# Edit PostgreSQL config
nano /etc/postgresql/17/main/postgresql.conf

# Add these settings:
max_connections = 200
shared_buffers = 1GB
work_mem = 20MB
maintenance_work_mem = 512MB
effective_cache_size = 3GB

# Restart PostgreSQL
systemctl restart postgresql
```

---

## Security Best Practices

### 1. Change Default Passwords

- ✅ Change DHIS2 admin password immediately
- ✅ Use strong database password
- ✅ Change root SSH password

### 2. Set Up Firewall

```bash
# Only allow necessary ports
ufw allow OpenSSH
ufw allow 8080/tcp
ufw enable
```

### 3. Set Up SSL (Optional but Recommended)

```bash
# Install Nginx and Certbot
apt install -y nginx certbot python3-certbot-nginx

# Get SSL certificate (requires domain name)
certbot --nginx -d yourdomain.com
```

### 4. Regular Backups

```bash
# Create backup script
cat > /opt/dhis2/backup.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/opt/dhis2/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
sudo -u postgres pg_dump dhis2 | gzip > $BACKUP_DIR/dhis2_db_$DATE.sql.gz
tar -czf $BACKUP_DIR/dhis2_files_$DATE.tar.gz /opt/dhis2/files
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete
EOF

chmod +x /opt/dhis2/backup.sh

# Schedule daily backups
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/dhis2/backup.sh") | crontab -
```

---

## Common Issues and Solutions

### Issue: Out of Memory Error

**Symptom:** DHIS2 crashes, logs show OutOfMemoryError

**Solution:**
1. Upgrade server to 4GB RAM minimum
2. Reduce Tomcat heap size if needed
3. Check for memory leaks

### Issue: PostgreSQL 17 Compatibility

**Symptom:** Flyway migration errors

**Solution:**
- DHIS2 2.40.5 officially supports PostgreSQL 15
- PostgreSQL 17 works but may show warnings
- For production, consider PostgreSQL 15

### Issue: Slow Performance

**Solution:**
1. Increase server RAM to 8GB
2. Optimize PostgreSQL settings
3. Add more CPU cores
4. Use SSD storage

### Issue: Can't Access from Browser

**Checklist:**
- ✅ Firewall allows port 8080
- ✅ Tomcat is running
- ✅ DHIS2 deployment succeeded
- ✅ Using correct IP address
- ✅ Using http:// (not https://)
- ✅ Port 8080 included in URL

---

## Quick Reference

### Important File Locations

```
DHIS2 Config:       /opt/dhis2/dhis.conf
DHIS2 Files:        /opt/dhis2/files
Tomcat Home:        /opt/tomcat
DHIS2 WAR:          /opt/tomcat/webapps/dhis.war
Tomcat Logs:        /opt/tomcat/logs/catalina.out
Tomcat Config:      /opt/tomcat/bin/setenv.sh
PostgreSQL Config:  /etc/postgresql/17/main/postgresql.conf
```

### Important Commands

```bash
# SSH to server
ssh root@192.34.63.53

# Restart DHIS2
systemctl restart tomcat

# View logs
tail -f /opt/tomcat/logs/catalina.out

# Check status
systemctl status tomcat
systemctl status postgresql

# Backup database
sudo -u postgres pg_dump dhis2 > backup.sql
```

### Default Credentials

```
DHIS2 Web Interface:
  Username: admin
  Password: district (CHANGE IMMEDIATELY!)

Database:
  Username: dhis
  Password: (as configured in dhis.conf)

SSH:
  Username: root
  Password: (as configured during setup)
```

---

## Next Steps After Installation

### Immediate Actions

1. ✅ Change admin password
2. ✅ Test login and logout
3. ✅ Verify all pages load correctly
4. ✅ Set up database backups

### First Week

1. **Set up organization hierarchy**
   - Create countries, regions, districts, facilities
   
2. **Create user roles**
   - Admin, Data Entry Clerk, Data Viewer, Analyst
   
3. **Add users**
   - Create accounts for team members
   
4. **Configure data elements**
   - Define health indicators to track

### Production Preparation

1. **Get domain name** (optional)
   - Point domain to server IP
   - Set up SSL certificate
   
2. **Set up monitoring**
   - Server monitoring
   - Application monitoring
   - Database monitoring
   
3. **Establish backup routine**
   - Automated daily backups
   - Off-site backup storage
   - Test restore procedures

4. **Train users**
   - System administrators
   - Data entry staff
   - Data analysts

---

## Resources

### Official Documentation
- DHIS2 Docs: https://docs.dhis2.org
- Installation Guide: https://docs.dhis2.org/en/manage/performing-system-administration/dhis-core-version-master/installation.html
- DHIS2 Community: https://community.dhis2.org

### Training
- DHIS2 Academy: https://academy.dhis2.org
- Online Courses: https://www.dhis2.org/online-academy

### Support
- Community Forums: https://community.dhis2.org
- GitHub Issues: https://github.com/dhis2/dhis2-core

---

## System Information

**Successfully Installed:**
- **Date:** October 10, 2025
- **DHIS2 Version:** 2.40.5
- **Java Version:** OpenJDK 17
- **PostgreSQL Version:** 17
- **Tomcat Version:** 9.0.95
- **Operating System:** Ubuntu 22.04 LTS
- **Server RAM:** 4GB
- **Server Storage:** 50GB SSD

**Access Information:**
- **URL:** http://192.34.63.53:8080/dhis
- **Default Username:** admin
- **Default Password:** district (CHANGED)

---

## License

This installation guide is provided as-is for educational purposes.

DHIS2 is open-source software licensed under BSD 3-Clause License.

---

## Acknowledgments

Successfully installed after troubleshooting:
- Memory allocation issues
- PostgreSQL compatibility
- Configuration file format
- File permissions
- Firewall settings

**Installation Time:** ~4 hours (including troubleshooting)
**Final Result:** ✅ Fully functional DHIS2 system

---

**End of Guide**

For questions or issues, refer to the DHIS2 Community forums or official documentation.
