function getCsrfToken() {
    const element = document.querySelector(
        'meta[name="csrf-token"]'
    );

    return element ? element.content : "";
}


function showMessage(message, isError = false) {
    const element = document.getElementById("message");

    if (!element) {
        return;
    }

    element.textContent = message;
    element.style.color = isError ? "#b42318" : "#16794b";
}


async function apiRequest(url, options = {}) {
    const headers = {
        ...(options.headers || {})
    };

    const method = (options.method || "GET").toUpperCase();

    if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
        const token = getCsrfToken();

        if (!token) {
            throw new Error(
                "CSRF token is missing. Check the csrf-token meta tag."
            );
        }

        headers["X-CSRFToken"] = token;
    }

    const response = await fetch(url, {
        ...options,
        headers: headers,
        credentials: "same-origin"
    });

    const contentType = response.headers.get("content-type") || "";

    let data = {};

    if (contentType.includes("application/json")) {
        data = await response.json();
    }

    if (response.status === 401) {
        throw new Error(
            "Your session may have expired. Please log in again."
        );
    }

    if (!response.ok) {
        throw new Error(
            data.error || "Request failed (" + response.status + ")"
        );
    }

    return data;
}


function createTable(headers, records) {
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    headers.forEach(function (header) {
        const th = document.createElement("th");
        th.textContent = header;
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    records.forEach(function (record) {
        const row = document.createElement("tr");

        record.forEach(function (value) {
            const cell = document.createElement("td");

            cell.textContent =
                value === null || value === undefined
                    ? "—"
                    : String(value);

            row.appendChild(cell);
        });

        tbody.appendChild(row);
    });

    table.appendChild(tbody);

    return table;
}


function getErrorMessage(error) {
    return error && error.message
        ? error.message
        : "An unexpected error occurred.";
}


// ==================================================
// 2. PATIENTS PAGE
// ==================================================

async function loadPatients() {
    const container = document.getElementById("patientList");

    if (!container) {
        return;
    }

    container.textContent = "Loading patient records...";

    try {
        const patients = await apiRequest("/api/patients");

        container.replaceChildren();

        if (!Array.isArray(patients) || patients.length === 0) {
            container.textContent = "No patients registered yet.";
            return;
        }

        const table = document.createElement("table");
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");

        [
            "ID",
            "Name",
            "Age",
            "Sex",
            "Department",
            "Actions"
        ].forEach(function (heading) {
            const th = document.createElement("th");
            th.textContent = heading;
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        patients.forEach(function (patient) {
            const row = document.createElement("tr");

            [
                patient.patient_id,
                patient.name,
                patient.age,
                patient.sex,
                patient.department || "General"
            ].forEach(function (value) {
                const cell = document.createElement("td");

                cell.textContent =
                    value === null || value === undefined
                        ? "—"
                        : String(value);

                row.appendChild(cell);
            });

            const actionCell = document.createElement("td");

            // Download patient report.
            const reportButton = document.createElement("button");

            reportButton.type = "button";
            reportButton.className = "patient-report-button";
            reportButton.textContent = "Download Report";

            reportButton.addEventListener("click", async function () {
                reportButton.disabled = true;
                reportButton.textContent = "Preparing...";

                try {
                    const response = await fetch(
                        "/api/reports/patient/" +
                        encodeURIComponent(patient.patient_id) +
                        ".pdf",
                        {
                            credentials: "same-origin"
                        }
                    );

                    if (!response.ok) {
                        let errorMessage =
                            "Could not download patient report.";

                        try {
                            const errorData = await response.json();
                            errorMessage = errorData.error || errorMessage;
                        } catch (ignored) {
                            // Keep the default error message.
                        }

                        throw new Error(errorMessage);
                    }

                    const blob = await response.blob();
                    const downloadUrl = URL.createObjectURL(blob);

                    const link = document.createElement("a");
                    link.href = downloadUrl;
                    link.download =
                        "patient_" +
                        patient.patient_id +
                        "_health_report.pdf";

                    document.body.appendChild(link);
                    link.click();
                    link.remove();

                    setTimeout(function () {
                        URL.revokeObjectURL(downloadUrl);
                    }, 1000);

                } catch (error) {
                    showMessage(getErrorMessage(error), true);
                } finally {
                    reportButton.disabled = false;
                    reportButton.textContent = "Download Report";
                }
            });

            actionCell.appendChild(reportButton);

            // Delete patient.
            const deleteButton = document.createElement("button");

            deleteButton.type = "button";
            deleteButton.className = "delete-patient-button";
            deleteButton.textContent = "Delete";

            deleteButton.addEventListener("click", async function () {
                const confirmed = confirm(
                    "Are you sure you want to delete " +
                    patient.name +
                    " (Patient ID: " +
                    patient.patient_id +
                    ")?\n\nThis action may also delete the patient's " +
                    "assessments and visits. It cannot be undone."
                );

                if (!confirmed) {
                    return;
                }

                deleteButton.disabled = true;
                deleteButton.textContent = "Deleting...";

                try {
                    const result = await apiRequest(
                        "/api/patients/" + patient.patient_id,
                        {
                            method: "DELETE"
                        }
                    );

                    showMessage(
                        result.message || "Patient deleted successfully."
                    );

                    await loadPatients();

                } catch (error) {
                    showMessage(getErrorMessage(error), true);
                } finally {
                    deleteButton.disabled = false;
                    deleteButton.textContent = "Delete";
                }
            });

            actionCell.appendChild(deleteButton);
            row.appendChild(actionCell);
            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        container.appendChild(table);

    } catch (error) {
        container.textContent = getErrorMessage(error);
    }
}

async function searchPatientsByDate(selectedDate) {
const container = document.getElementById("patientList");
const heading = document.getElementById("patientListHeading");
const description = document.getElementById("patientListDescription");

if (!container || !selectedDate) {
    showMessage("Please select a date.", true);
    return;
}

container.textContent = "Searching patients...";

try {
    const patients = await apiRequest(
        "/api/patients/by-date?date=" +
        encodeURIComponent(selectedDate)
    );

    container.replaceChildren();

    if (heading) {
        heading.textContent = "Patients Registered on " + selectedDate;
    }

    if (description) {
        description.textContent =
            "Showing patients registered on the selected date.";
    }

    if (!Array.isArray(patients) || patients.length === 0) {
        container.textContent =
            "No patients were registered on " + selectedDate + ".";
        return;
    }

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    [
        "ID",
        "Name",
        "Age",
        "Sex",
        "Department",
        "Actions"
    ].forEach(function (headingText) {
        const th = document.createElement("th");
        th.textContent = headingText;
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    patients.forEach(function (patient) {
        const row = document.createElement("tr");

        [
            patient.patient_id,
            patient.name,
            patient.age,
            patient.sex,
            patient.department || "General"
        ].forEach(function (value) {
            const cell = document.createElement("td");

            cell.textContent =
                value === null || value === undefined
                    ? "—"
                    : String(value);

            row.appendChild(cell);
        });

        const actionCell = document.createElement("td");

        // Download patient report.
        const reportButton = document.createElement("button");

        reportButton.type = "button";
        reportButton.className = "patient-report-button";
        reportButton.textContent = "Download Report";

        reportButton.addEventListener("click", async function () {
            reportButton.disabled = true;
            reportButton.textContent = "Preparing...";

            try {
                const response = await fetch(
                    "/api/reports/patient/" +
                    encodeURIComponent(patient.patient_id) +
                    ".pdf",
                    {
                        credentials: "same-origin"
                    }
                );

                if (!response.ok) {
                    let errorMessage =
                        "Could not download patient report.";

                    try {
                        const errorData = await response.json();
                        errorMessage = errorData.error || errorMessage;
                    } catch (ignored) {
                        // Keep the default error message.
                    }

                    throw new Error(errorMessage);
                }

                const blob = await response.blob();
                const downloadUrl = URL.createObjectURL(blob);
                const link = document.createElement("a");

                link.href = downloadUrl;
                link.download =
                    "patient_" +
                    patient.patient_id +
                    "_health_report.pdf";

                document.body.appendChild(link);
                link.click();
                link.remove();

                setTimeout(function () {
                    URL.revokeObjectURL(downloadUrl);
                }, 1000);

            } catch (error) {
                showMessage(getErrorMessage(error), true);
            } finally {
                reportButton.disabled = false;
                reportButton.textContent = "Download Report";
            }
        });

        actionCell.appendChild(reportButton);

        // Delete patient.
        const deleteButton = document.createElement("button");

        deleteButton.type = "button";
        deleteButton.className = "delete-patient-button";
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", async function () {
            const confirmed = confirm(
                "Are you sure you want to delete " +
                patient.name +
                " (Patient ID: " +
                patient.patient_id +
                ")?\n\nThis action may also delete the patient's " +
                "assessments and visits. It cannot be undone."
            );

            if (!confirmed) {
                return;
            }

            deleteButton.disabled = true;
            deleteButton.textContent = "Deleting...";

            try {
                const result = await apiRequest(
                    "/api/patients/" + patient.patient_id,
                    {
                        method: "DELETE"
                    }
                );

                showMessage(
                    result.message || "Patient deleted successfully."
                );

                // Refresh the currently selected date.
                await searchPatientsByDate(selectedDate);

            } catch (error) {
                showMessage(getErrorMessage(error), true);
            } finally {
                deleteButton.disabled = false;
                deleteButton.textContent = "Delete";
            }
        });

        actionCell.appendChild(deleteButton);
        row.appendChild(actionCell);
        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);

    showMessage(
        patients.length +
        (patients.length === 1
            ? " patient found."
            : " patients found.")
    );

} catch (error) {
    container.textContent = getErrorMessage(error);
    showMessage(getErrorMessage(error), true);
}

}

function initializePatientDateSearch() {
const form = document.getElementById("patientDateForm");
const dateInput = document.getElementById("patientSearchDate");
const showAllButton = document.getElementById("showAllPatients");

if (!form || !dateInput) {
    return;
}

// Search for patients registered on the selected date.
form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const selectedDate = dateInput.value;

    if (!selectedDate) {
        showMessage("Please select a date.", true);
        return;
    }

    await searchPatientsByDate(selectedDate);
});

// Clear the date filter and show every patient.
if (showAllButton) {
    showAllButton.addEventListener("click", async function () {
        form.reset();

        const heading = document.getElementById("patientListHeading");
        const description =
            document.getElementById("patientListDescription");

        if (heading) {
            heading.textContent = "Registered Patients";
        }

        if (description) {
            description.textContent =
                "View and manage all registered patients.";
        }

        await loadPatients();
    });
}

}

function initializePatientForm() {
    const form = document.getElementById("patientForm");

    if (!form) {
        return;
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const payload = {
            name: form.elements.name.value.trim(),
            age: Number(form.elements.age.value),
            sex: form.elements.sex.value,
            department: form.elements.department.value
        };

        try {
            const result = await apiRequest("/api/patients", {
                method: "POST",
                body: JSON.stringify(payload)
            });
x
            showMessage(
                (result.message || "Patient registered successfully.") +
                ". Patient ID: " +
                result.patient_id
            );

            form.reset();

            await loadPatients();

        } catch (error) {
            showMessage(getErrorMessage(error), true);
        }
    });
}


// ==================================================
// 3. ASSESSMENT PAGE
// ==================================================

function initializeAssessmentForm() {
    const form = document.getElementById("assessmentForm");

    if (!form) {
        return;
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const payload = {
            patient_id: Number(form.elements.patient_id.value),
            height_cm: Number(form.elements.height_cm.value),
            weight_kg: Number(form.elements.weight_kg.value),
            systolic_bp: Number(form.elements.systolic_bp.value),
            diastolic_bp: Number(form.elements.diastolic_bp.value),
            glucose: Number(form.elements.glucose.value)
        };

        try {
            const result = await apiRequest("/api/assessments", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            showMessage(
                (result.message || "Assessment saved successfully.") +
                ". BMI: " +
                result.bmi
            );

            form.reset();

        } catch (error) {
            showMessage(getErrorMessage(error), true);
        }
    });
}


// ==================================================
// 4. VISITS PAGE
// ==================================================

function initializeVisitForm() {
    const form = document.getElementById("visitForm");

    if (!form) {
        return;
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const payload = {
            patient_id: Number(form.elements.patient_id.value),
            visit_type: form.elements.visit_type.value,
            department: form.elements.department.value,
            notes: form.elements.notes.value.trim()
        };

        try {
            const result = await apiRequest("/api/visits", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            showMessage(
                (result.message || "Visit recorded successfully.") +
                ". Visit ID: " +
                result.visit_id
            );

            form.reset();

        } catch (error) {
            showMessage(getErrorMessage(error), true);
        }
    });
}


// ==================================================
// 5. PATIENT HISTORY PAGE
// ==================================================

function initializeHistoryForm() {
    const form = document.getElementById("historyForm");

    if (!form) {
        return;
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const patientId = Number(form.elements.patient_id.value);
        const container = document.getElementById("historyResults");

        if (!container) {
            return;
        }

        container.textContent = "Loading assessment history...";

        try {
            const records = await apiRequest(
                "/api/patients/" + patientId + "/assessments"
            );

            container.replaceChildren();

            if (!Array.isArray(records) || records.length === 0) {
                container.textContent =
                    "No assessments found for this patient.";
                return;
            }

            const rows = [];

            records.forEach(function (record) {
                rows.push([
                    record.assessment_id,
                    record.created_at,
                    record.height_cm,
                    record.weight_kg,
                    record.bmi,
                    record.systolic_bp,
                    record.diastolic_bp,
                    record.glucose
                ]);
            });

            container.appendChild(
                createTable(
                    [
                        "Assessment ID",
                        "Date",
                        "Height (cm)",
                        "Weight (kg)",
                        "BMI",
                        "Systolic BP",
                        "Diastolic BP",
                        "Glucose"
                    ],
                    rows
                )
            );

        } catch (error) {
            container.textContent = getErrorMessage(error);
        }
    });
}


// ==================================================
// 6. HEALTH INDICATORS PAGE
// ==================================================

function initializeIndicatorForm() {
    const form = document.getElementById("indicatorForm");

    if (!form) {
        return;
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const assessmentId = Number(
            form.elements.assessment_id.value
        );

        const container = document.getElementById("indicatorResults");

        if (!container) {
            return;
        }

        container.replaceChildren();

        const loading = document.createElement("p");
        loading.textContent = "Loading health indicators...";
        container.appendChild(loading);

        try {
            const data = await apiRequest(
                "/api/assessments/" + assessmentId + "/indicators"
            );

            container.replaceChildren();

            const heading = document.createElement("h3");
            heading.textContent = "Assessment #" + data.assessment_id;
            container.appendChild(heading);

            const patientInfo = document.createElement("p");
            patientInfo.textContent = "Patient ID: " + data.patient_id;
            container.appendChild(patientInfo);

            const resultData = data.analysis || {};
            const indicators = resultData.indicators || [];

            if (indicators.length === 0) {
                const emptyMessage = document.createElement("p");
                emptyMessage.textContent =
                    "No health indicators were returned for this assessment.";
                container.appendChild(emptyMessage);
            }

            indicators.forEach(function (indicator) {
                const card = document.createElement("div");
                card.className = "indicator-card";

                const title = document.createElement("h3");
                title.textContent = indicator.measurement;

                const value = document.createElement("p");
                value.textContent =
                    "Recorded value: " + indicator.value;

                const result = document.createElement("p");
                result.className = "indicator-result";
                result.textContent =
                    "Result: " + indicator.result;

                const explanation = document.createElement("p");
                explanation.className = "indicator-explanation";
                explanation.textContent = indicator.explanation;

                card.appendChild(title);
                card.appendChild(value);
                card.appendChild(result);
                card.appendChild(explanation);

                container.appendChild(card);
            });

            const disclaimer = document.createElement("p");
            disclaimer.className = "disclaimer";
            disclaimer.textContent =
                "Educational information only. These indicators are not " +
                "diagnoses or validated predictions of disease.";

            container.appendChild(disclaimer);

        } catch (error) {
            container.replaceChildren();

            const errorMessage = document.createElement("p");
            errorMessage.className = "error-message";
            errorMessage.textContent = getErrorMessage(error);

            container.appendChild(errorMessage);
        }
    });
}


// ==================================================
// 7. DASHBOARD STATISTICS
// ==================================================

async function loadDashboard() {
    const totalPatients = document.getElementById("totalPatients");
    const totalAssessments = document.getElementById("totalAssessments");
    const recentContainer = document.getElementById("recentAssessments");

    try {
        const data = await apiRequest("/api/dashboard/stats");

        if (totalPatients) {
            totalPatients.textContent = data.total_patients ?? "0";
        }

        if (totalAssessments) {
            totalAssessments.textContent = data.total_assessments ?? "0";
        }

        if (!recentContainer) {
            return;
        }

        recentContainer.replaceChildren();

        if (
            !Array.isArray(data.recent_assessments) ||
            data.recent_assessments.length === 0
        ) {
            recentContainer.textContent =
                "No assessments recorded yet.";
            return;
        }

        const rows = [];

        data.recent_assessments.forEach(function (record) {
            let formattedDate = "—";

            if (record.created_at) {
                const date = new Date(record.created_at);

                if (!Number.isNaN(date.getTime())) {
                    formattedDate = date.toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                    });
                }
            }

            rows.push([
                record.assessment_id,
                record.patient_id,
                record.patient_name,
                record.bmi,
                formattedDate
            ]);
        });

        recentContainer.appendChild(
            createTable(
                [
                    "Assessment ID",
                    "Patient ID",
                    "Patient Name",
                    "BMI",
                    "Date"
                ],
                rows
            )
        );

    } catch (error) {
        if (totalPatients) {
            totalPatients.textContent = "Unavailable";
        }

        if (totalAssessments) {
            totalAssessments.textContent = "Unavailable";
        }

        if (recentContainer) {
            recentContainer.textContent = getErrorMessage(error);
        }
    }
}


// ==================================================
// 8. DASHBOARD ANALYTICS
// ==================================================

async function loadHealthcareAnalytics() {
    const visitsElement = document.getElementById("totalVisits");
    const averagesContainer =
        document.getElementById("measurementAverages");

    try {
        const data = await apiRequest("/api/analytics");

        if (visitsElement) {
            visitsElement.textContent = data.total_visits ?? "0";
        }

        if (!averagesContainer) {
            return;
        }

        averagesContainer.replaceChildren();

        const descriptions = {
            bmi: "Average BMI",
            systolic_bp: "Average systolic BP (mmHg)",
            diastolic_bp: "Average diastolic BP (mmHg)",
            glucose: "Average glucose (unit depends on dataset)"
        };

        Object.keys(descriptions).forEach(function (key) {
            const paragraph = document.createElement("p");
            const value = data.measurement_averages
                ? data.measurement_averages[key]
                : null;

            paragraph.textContent =
                descriptions[key] + ": " +
                (
                    value === null || value === undefined
                        ? "No data"
                        : value
                );

            averagesContainer.appendChild(paragraph);
        });

    } catch (error) {
        if (visitsElement) {
            visitsElement.textContent = "Unavailable";
        }

        if (averagesContainer) {
            averagesContainer.textContent = getErrorMessage(error);
        }
    }
}


// ==================================================
// 9. REFRESH DASHBOARD
// ==================================================

async function refreshDashboard() {
    const dashboard = document.getElementById("dashboard");

    // Avoid dashboard requests from other pages.
    if (!dashboard) {
        return;
    }

    await Promise.all([
        loadDashboard(),
        loadHealthcareAnalytics()
    ]);

    const departmentImage = document.querySelector(
        'img[alt="Patients grouped by department"]'
    );

    const visitsImage = document.querySelector(
        'img[alt="Number of visits by date"]'
    );

    if (departmentImage) {
        departmentImage.src =
            "/api/charts/department?t=" + Date.now();
    }

    if (visitsImage) {
        visitsImage.src =
            "/api/charts/visits?t=" + Date.now();
    }
}


// ==================================================
// 10. PAGE INITIALIZATION
// ==================================================

document.addEventListener("DOMContentLoaded", function () {
    // Patients page.
    if (document.getElementById("patientForm")) {
        initializePatientForm();
        loadPatients();
    }

    // Assessment page.
    if (document.getElementById("assessmentForm")) {
        initializeAssessmentForm();
    }

    // Visits page.
    if (document.getElementById("visitForm")) {
        initializeVisitForm();
    }

    // Patient History page.
    if (document.getElementById("historyForm")) {
        initializeHistoryForm();
    }

    // Health Indicators page.
    if (document.getElementById("indicatorForm")) {
        initializeIndicatorForm();
    }

    // Dashboard page only.
    if (document.getElementById("dashboard")) {
        refreshDashboard();
    }
    initializePatientDateSearch();
});