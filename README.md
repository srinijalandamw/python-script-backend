
# GSD Python Script Runner  : A scalable backend system to execute Python scripts dynamically using Node.js, Docker, and Kubernetes*  


# What This System Does  
- Accepts script execution jobs  
- Stores jobs in **MongoDB**  
- Worker picks jobs → triggers **Kubernetes Job**  
- Python script runs inside container  
- Output extracted from logs  
- Results stored in **local/S3 storage**  

---

# Flow (Step‑by‑Step)  

**1️⃣ Job Creation**  
- User → API → MongoDB  
- Status = **PENDING**  

**2️⃣ Worker Loop**  
- Worker finds PENDING job  
- Locks job → status = **RUNNING**  
- Sends job to Runner  

**3️⃣ Runner**  
- Runner calls Kubernetes client  
- Creates a **Kubernetes Job**  

**4️⃣ Kubernetes Job Execution**  
- Container runs:  
  - Download `script.zip`  
  - Unzip contents  
  - Install dependencies  
  - Run `main.py`  
  - Print `OUTPUT_JSON`  

**5️⃣ Monitor**  
- Monitor watches Kubernetes jobs  
- Fetches logs  
- Extracts `OUTPUT_JSON`  
- Updates MongoDB  

---

# 🔁 Architecture  

User/API
   ↓
MongoDB (jobs)
   ↓
Worker (polling)
   ↓
Runner
   ↓
Kubernetes Job
   ↓
Monitor
   ↓
MongoDB (results)

## 📂 Key Folders  

| Folder                  | Purpose                          |
|--------------------------|----------------------------------|
| `src/modules/executions` | Worker + Runner logic            |
| `src/k8s`                | Kubernetes client + monitor      |
| `src/utils/storage`      | Local/S3 storage abstraction     |
| `src/routes`             | API endpoints                    |

---

