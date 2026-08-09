// https://api.github.com/repos/DevExpress/DevExtreme/dependabot/alerts?state=open
export class DependabotAlertDto {
    number: number;
    state: string;
    security_advisory: SecurityAdvisory;
    security_vulnerability: SecurityVulnerability;
    url: string;
    html_url: string;
    created_at: string;
    updated_at: string;
}

export class SecurityAdvisory {
    summary: string;
    description: string;
    severity: string;
}

export class SecurityVulnerability {
    severity: string;
}
