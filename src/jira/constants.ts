/**
 * Jira constants for the DNIEM project (DN_Internal Effort Management).
 *
 * All IDs and option values are extracted from the live Jira 8
 * create-issue form metadata at https://jira8.runsystem.info.
 *
 * Use these when building the payload for POST /rest/api/2/issue.
 */

export const ISSUE_TYPE = {
  EPIC: "10100",
  STORY: "10101",
  TASK: "10000",
  IMPROVEMENT: "10210",
  BUG: "10202",
  BUG_CUSTOMER: "10203",
  LEAKAGE: "10204",
  QA: "10205",
  CHANGE_REQUEST: "10206",
  RISK: "10207",
  OPPORTUNITY: "10208",
  ISSUE: "10209",
  NEW_FEATURE: "10211",
  LESSON_PRACTICE: "10212",
  DELIVERABLE: "10213",
  COMTOR_TASK: "10214",
  FEEDBACK: "10408",
  DEPENDENCY: "10806",
  PROJECT_TRAINING: "10804",
  NC: "11000",
  INCIDENT: "10400",
  MA: "11100",
  REVIEW_COMMENT: "11200",
  REVIEW_DEFECT: "10805",
} as const;

export type IssueTypeId = (typeof ISSUE_TYPE)[keyof typeof ISSUE_TYPE];

export const ISSUE_TYPE_LABEL: Record<IssueTypeId, string> = {
  [ISSUE_TYPE.EPIC]: "Epic",
  [ISSUE_TYPE.STORY]: "Story",
  [ISSUE_TYPE.TASK]: "Task",
  [ISSUE_TYPE.IMPROVEMENT]: "Improvement",
  [ISSUE_TYPE.BUG]: "Bug",
  [ISSUE_TYPE.BUG_CUSTOMER]: "Bug_Customer",
  [ISSUE_TYPE.LEAKAGE]: "Leakage",
  [ISSUE_TYPE.QA]: "QA",
  [ISSUE_TYPE.CHANGE_REQUEST]: "Change Request",
  [ISSUE_TYPE.RISK]: "Risk",
  [ISSUE_TYPE.OPPORTUNITY]: "Opportunity",
  [ISSUE_TYPE.ISSUE]: "Issue",
  [ISSUE_TYPE.NEW_FEATURE]: "New Feature",
  [ISSUE_TYPE.LESSON_PRACTICE]: "Lesson Practice",
  [ISSUE_TYPE.DELIVERABLE]: "Deliverable",
  [ISSUE_TYPE.COMTOR_TASK]: "Comtor Task",
  [ISSUE_TYPE.FEEDBACK]: "Feedback",
  [ISSUE_TYPE.DEPENDENCY]: "Dependency",
  [ISSUE_TYPE.PROJECT_TRAINING]: "Project Training",
  [ISSUE_TYPE.NC]: "NC",
  [ISSUE_TYPE.INCIDENT]: "Incident",
  [ISSUE_TYPE.MA]: "MA",
  [ISSUE_TYPE.REVIEW_COMMENT]: "Review Comment",
  [ISSUE_TYPE.REVIEW_DEFECT]: "Review Defect",
} as const;

/**
 * Standard (non-custom) Jira field keys used in the create-issue payload.
 */
export const FIELD = {
  PROJECT: "project",
  ISSUE_TYPE: "issuetype",
  SUMMARY: "summary",
  DESCRIPTION: "description",
  ASSIGNEE: "assignee",
  PRIORITY: "priority",
  COMPONENTS: "components",
  LABELS: "labels",
  DUE_DATE: "duedate",
  FIX_VERSIONS: "fixVersions",
  AFFECTS_VERSIONS: "versions",
  RESOLUTION: "resolution",
  ISSUE_LINKS: "issuelinks",
  ATTACHMENT: "attachment",
  TIME_TRACKING: "timetracking",
} as const;

export const CUSTOM_FIELD = {
  /** % Done */
  DONE: "customfield_10338",
  /** (Epic Sum Up) Allocation Field */
  EPIC_SUM_UP_ALLOCATION_FIELD: "customfield_11913",
  /** (Epic Sum Up) Progress Customfield */
  EPIC_SUM_UP_PROGRESS_CUSTOMFIELD: "customfield_11914",
  /** AMIS tuyển dụng => Đăng tuyển các kênh */
  AMIS_TUY_N_D_NG_NG_TUY_N_C_C_K_NH: "customfield_11419",
  /** APPROVER - Waiting for approval => Open */
  APPROVER_WAITING_FOR_APPROVAL_OPEN: "customfield_12618",
  /** Account */
  ACCOUNT: "customfield_10301",
  /** Action */
  ACTION: "customfield_10333",
  /** Actual End Date */
  ACTUAL_END_DATE: "customfield_10316",
  /** Actual End Date Project */
  ACTUAL_END_DATE_PROJECT: "customfield_13501",
  /** Actual Start Date */
  ACTUAL_START_DATE: "customfield_10315",
  /** Additional Information/Request */
  ADDITIONAL_INFORMATION_REQUEST: "customfield_11570",
  /** Address */
  ADDRESS: "customfield_11810",
  /** Affected Objects */
  AFFECTED_OBJECTS: "customfield_12003",
  /** Affects Version/s */
  AFFECTS_VERSION_S: "versions",
  /** After VAT (Total) (tiền) */
  AFTER_VAT_TOTAL_TI_N: "customfield_12503",
  /** Approvers */
  APPROVERS: "customfield_10708",
  /** Assignee */
  ASSIGNEE: "assignee",
  /** Attendees */
  ATTENDEES: "customfield_11809",
  /** Audit Type */
  AUDIT_TYPE: "customfield_12002",
  /** BA - In discustion => Spec clear */
  BA_IN_DISCUSTION_SPEC_CLEAR: "customfield_12620",
  /** BA - Open => In discustion */
  BA_OPEN_IN_DISCUSTION: "customfield_12619",
  /** BA - feedback required => in discustion */
  BA_FEEDBACK_REQUIRED_IN_DISCUSTION: "customfield_12628",
  /** BD Status */
  BD_STATUS: "customfield_12701",
  /** Baseline end date */
  BASELINE_END_DATE: "customfield_10403",
  /** Baseline finish date (WBSGantt) */
  BASELINE_FINISH_DATE_WBSGANTT: "customfield_11918",
  /** Baseline start date */
  BASELINE_START_DATE: "customfield_10402",
  /** Baseline start date (WBSGantt) */
  BASELINE_START_DATE_WBSGANTT: "customfield_11917",
  /** Before VAT (Tiền) */
  BEFORE_VAT_TI_N: "customfield_12501",
  /** Benefit */
  BENEFIT: "customfield_10737",
  /** CAB */
  CAB: "customfield_10724",
  /** CSS */
  CSS: "customfield_12205",
  /** Cam kết đảm bảo an toàn tài sản và bảo mật thông tin lưu trữ trên tài sản mang ra ngoài */
  CAM_K_T_M_B_O_AN_TO_N_T_I_S_N_V_B_O_M_T_TH_NG_TIN_L_U_TR_TR_N_T_I_S_N_MANG_RA_NGO_I:
    "customfield_11300",
  /** Cause Analysis */
  CAUSE_ANALYSIS: "customfield_10331",
  /** Cause Category */
  CAUSE_CATEGORY: "customfield_10324",
  /** Change completion date */
  CHANGE_COMPLETION_DATE: "customfield_10714",
  /** Change managers */
  CHANGE_MANAGERS: "customfield_10723",
  /** Change reason */
  CHANGE_REASON: "customfield_10712",
  /** Change risk */
  CHANGE_RISK: "customfield_10711",
  /** Change start date */
  CHANGE_START_DATE: "customfield_10713",
  /** Change type */
  CHANGE_TYPE: "customfield_10710",
  /** Comment Number */
  COMMENT_NUMBER: "customfield_10740",
  /** Component Create */
  COMPONENT_CREATE: "customfield_10801",
  /** Component/s */
  COMPONENT_S: "components",
  /** Container Link */
  CONTAINER_LINK: "customfield_11912",
  /** Contingency Action */
  CONTINGENCY_ACTION: "customfield_10734",
  /** Control Measures */
  CONTROL_MEASURES: "customfield_11545",
  /** Cost */
  COST: "customfield_10736",
  /** Created */
  CREATED: "created",
  /** Creator */
  CREATOR: "creator",
  /** Currency */
  CURRENCY: "customfield_12504",
  /** Customer Information */
  CUSTOMER_INFORMATION: "customfield_11803",
  /** Customer Request Type */
  CUSTOMER_REQUEST_TYPE: "customfield_10704",
  /** Cut IP (Y/N) */
  CUT_IP_Y_N: "customfield_13300",
  /** DEV - In progress => Resolved */
  DEV_IN_PROGRESS_RESOLVED: "customfield_12623",
  /** DEV - Reopen => In progress */
  DEV_REOPEN_IN_PROGRESS: "customfield_12626",
  /** DEV - SPEC CLEARED => In progress */
  DEV_SPEC_CLEARED_IN_PROGRESS: "customfield_12622",
  /** Defect Origin */
  DEFECT_ORIGIN: "customfield_10336",
  /** Defect Owner */
  DEFECT_OWNER: "customfield_10320",
  /** Defect Type */
  DEFECT_TYPE: "customfield_10323",
  /** Degrade */
  DEGRADE: "customfield_10335",
  /** Departments */
  DEPARTMENTS: "customfield_13302",
  /** Dependency Object */
  DEPENDENCY_OBJECT: "customfield_11565",
  /** Dependenter */
  DEPENDENTER: "customfield_11567",
  /** Description */
  DESCRIPTION: "description",
  /** Destination IP */
  DESTINATION_IP: "customfield_11405",
  /** Development */
  DEVELOPMENT: "customfield_10000",
  /** Development Model */
  DEVELOPMENT_MODEL: "customfield_11100",
  /** Difficulty Level */
  DIFFICULTY_LEVEL: "customfield_12100",
  /** Discovery Date */
  DISCOVERY_DATE: "customfield_12004",
  /** DoD */
  DOD: "customfield_10810",
  /** Done Chi Phí => Tạo job trên AMIS TD */
  DONE_CHI_PH_T_O_JOB_TR_N_AMIS_TD: "customfield_11418",
  /** Due Date */
  DUE_DATE: "duedate",
  /** Duyệt => Xác nhận Yêu cầu */
  DUY_T_X_C_NH_N_Y_U_C_U: "customfield_11415",
  /** Email */
  EMAIL: "customfield_11581",
  /** Employee_code */
  EMPLOYEE_CODE: "customfield_11575",
  /** Employee_info */
  EMPLOYEE_INFO: "customfield_11807",
  /** End Date Time */
  END_DATE_TIME: "customfield_11806",
  /** End date */
  END_DATE: "customfield_10600",
  /** Environment */
  ENVIRONMENT: "environment",
  /** Epic Color */
  EPIC_COLOR: "customfield_10204",
  /** Epic Link */
  EPIC_LINK: "customfield_10201",
  /** Epic Name */
  EPIC_NAME: "customfield_10203",
  /** Epic Status */
  EPIC_STATUS: "customfield_10202",
  /** External issue ID */
  EXTERNAL_ISSUE_ID: "customfield_10747",
  /** FI Result */
  FI_RESULT: "customfield_12303",
  /** Finish date (WBSGantt) */
  FINISH_DATE_WBSGANTT: "customfield_11916",
  /** Fix Version/s */
  FIX_VERSION_S: "fixVersions",
  /** Flagged */
  FLAGGED: "customfield_10762",
  /** HC */
  HC: "customfield_11406",
  /** HR (cần duyệt) */
  HR_C_N_DUY_T: "customfield_11407",
  /** HR (không cần duyệt) */
  HR_KH_NG_C_N_DUY_T: "customfield_11408",
  /** HR nhận Order - Done */
  HR_NH_N_ORDER_DONE: "customfield_11421",
  /** Handling Option */
  HANDLING_OPTION: "customfield_10329",
  /** Has Bill for CR */
  HAS_BILL_FOR_CR: "customfield_11568",
  /** IID - Waiting for approval */
  IID_WAITING_FOR_APPROVAL: "customfield_12615",
  /** IID - Waiting for aproval => Open */
  IID_WAITING_FOR_APROVAL_OPEN: "customfield_12616",
  /** IID- Waiting for approval => Open */
  IID_WAITING_FOR_APPROVAL_OPEN: "customfield_12617",
  /** IT */
  IT: "customfield_11409",
  /** Images */
  IMAGES: "thumbnail",
  /** Impact */
  IMPACT: "customfield_10332",
  /** Impact Assessment */
  IMPACT_ASSESSMENT: "customfield_10325",
  /** Impact đến doanh thu */
  IMPACT_N_DOANH_THU: "customfield_12401",
  /** Impact_other */
  IMPACT_OTHER: "customfield_10709",
  /** Incident Scope */
  INCIDENT_SCOPE: "customfield_12006",
  /** Incident Type */
  INCIDENT_TYPE: "customfield_12005",
  /** Investigation reason */
  INVESTIGATION_REASON: "customfield_10717",
  /** Issue Difficulty Levels */
  ISSUE_DIFFICULTY_LEVELS: "customfield_12632",
  /** Issue Type */
  ISSUE_TYPE: "issuetype",
  /** Iteration */
  ITERATION: "customfield_10300",
  /** Key */
  KEY: "issuekey",
  /** Kết nối với bên thứ 3 */
  K_T_N_I_V_I_B_N_TH_3: "customfield_12403",
  /** LOC Number */
  LOC_NUMBER: "customfield_10700",
  /** Labels */
  LABELS: "labels",
  /** Last Comment */
  LAST_COMMENT: "customfield_10701",
  /** Last Viewed */
  LAST_VIEWED: "lastViewed",
  /** Leakage type */
  LEAKAGE_TYPE: "customfield_12801",
  /** Likelihood */
  LIKELIHOOD: "customfield_10731",
  /** Linked Issues */
  LINKED_ISSUES: "issuelinks",
  /** Loại task */
  LO_I_TASK: "customfield_11555",
  /** Lý do */
  L_DO: "customfield_13321",
  /** Lý do chậm */
  L_DO_CH_M: "customfield_11556",
  /** Lý do tuyển */
  L_DO_TUY_N: "customfield_11552",
  /** MAC address */
  MAC_ADDRESS: "customfield_10902",
  /** Manually scheduled (WBSGantt) */
  MANUALLY_SCHEDULED_WBSGANTT: "customfield_11922",
  /** Milestone (WBSGantt) */
  MILESTONE_WBSGANTT: "customfield_11920",
  /** Mitigation Action */
  MITIGATION_ACTION: "customfield_10733",
  /** Number of products not on time */
  NUMBER_OF_PRODUCTS_NOT_ON_TIME: "customfield_12305",
  /** Number of products on time */
  NUMBER_OF_PRODUCTS_ON_TIME: "customfield_12304",
  /** Nếu order bán dịch vụ mới hoặc thay đổi giá dịch vụ */
  N_U_ORDER_B_N_D_CH_V_M_I_HO_C_THAY_I_GI_D_CH_V: "customfield_12402",
  /** Old-Department */
  OLD_DEPARTMENT: "customfield_11400",
  /** Old_All Department */
  OLD_ALL_DEPARTMENT: "customfield_11411",
  /** Old_Department_list_CCTC_2026_HR_Tuyen */
  OLD_DEPARTMENT_LIST_CCTC_2026_HR_TUYEN: "customfield_13402",
  /** Old_Department_order_creative */
  OLD_DEPARTMENT_ORDER_CREATIVE: "customfield_11553",
  /** Old_List Department */
  OLD_LIST_DEPARTMENT: "customfield_11701",
  /** Operational categorization */
  OPERATIONAL_CATEGORIZATION: "customfield_10719",
  /** Opportunity Action */
  OPPORTUNITY_ACTION: "customfield_13000",
  /** Opportunity Category */
  OPPORTUNITY_CATEGORY: "customfield_10328",
  /** Opportunity Handling */
  OPPORTUNITY_HANDLING: "customfield_10330",
  /** Opportunity Level */
  OPPORTUNITY_LEVEL: "customfield_12900",
  /** Organizations */
  ORGANIZATIONS: "customfield_10705",
  /** Original Estimate */
  ORIGINAL_ESTIMATE: "timeoriginalestimate",
  /** PCV Point */
  PCV_POINT: "customfield_12204",
  /** POD */
  POD: "customfield_12200",
  /** Page Number */
  PAGE_NUMBER: "customfield_10738",
  /** Pending reason */
  PENDING_REASON: "customfield_10720",
  /** Phase */
  PHASE: "customfield_12301",
  /** Plan Start Date */
  PLAN_START_DATE: "customfield_10313",
  /** Port local */
  PORT_LOCAL: "customfield_11403",
  /** Port public */
  PORT_PUBLIC: "customfield_11402",
  /** Price */
  PRICE: "customfield_11811",
  /** Priority */
  PRIORITY: "priority",
  /** Private IP local */
  PRIVATE_IP_LOCAL: "customfield_11404",
  /** Process */
  PROCESS: "customfield_12300",
  /** Product categorization */
  PRODUCT_CATEGORIZATION: "customfield_10718",
  /** Progress */
  PROGRESS: "progress",
  /** Progress (WBSGantt) */
  PROGRESS_WBSGANTT: "customfield_11919",
  /** Project */
  PROJECT: "project",
  /** Project Key */
  PROJECT_KEY: "customfield_11600",
  /** Project Name */
  PROJECT_NAME: "customfield_11401",
  /** Project Stages */
  PROJECT_STAGES: "customfield_10339",
  /** Purpose */
  PURPOSE: "customfield_12400",
  /** QA Follow */
  QA_FOLLOW: "customfield_12800",
  /** Quantity */
  QUANTITY: "customfield_11808",
  /** REQUESTER - Request clarification => Close */
  REQUESTER_REQUEST_CLARIFICATION_CLOSE: "customfield_12621",
  /** REQUESTER - Verified => Close,feedback required */
  REQUESTER_VERIFIED_CLOSE_FEEDBACK_REQUIRED: "customfield_12627",
  /** RTM Environment */
  RTM_ENVIRONMENT: "customfield_11911",
  /** Rank */
  RANK: "customfield_10205",
  /** Release Notes */
  RELEASE_NOTES: "customfield_10742",
  /** Release environment */
  RELEASE_ENVIRONMENT: "customfield_10741",
  /** Release not on time Number */
  RELEASE_NOT_ON_TIME_NUMBER: "customfield_12203",
  /** Release on time Number */
  RELEASE_ON_TIME_NUMBER: "customfield_12202",
  /** Remaining Estimate */
  REMAINING_ESTIMATE: "timeestimate",
  /** Reporter */
  REPORTER: "reporter",
  /** Request participants */
  REQUEST_PARTICIPANTS: "customfield_10703",
  /** Requested Document Type(s) */
  REQUESTED_DOCUMENT_TYPE_S: "customfield_11804",
  /** Residual risk */
  RESIDUAL_RISK: "customfield_11548",
  /** Resolution */
  RESOLUTION: "resolution",
  /** Resolved */
  RESOLVED: "resolutiondate",
  /** Resolved for a time */
  RESOLVED_FOR_A_TIME: "customfield_11563",
  /** Result */
  RESULT: "customfield_10802",
  /** Revoke Port (Y/N) */
  REVOKE_PORT_Y_N: "customfield_13108",
  /** Revoke Tool */
  REVOKE_TOOL: "customfield_12500",
  /** Risk Owner */
  RISK_OWNER: "customfield_11544",
  /** Risk consequence */
  RISK_CONSEQUENCE: "customfield_10407",
  /** Risk level */
  RISK_LEVEL: "customfield_10735",
  /** Risk probability */
  RISK_PROBABILITY: "customfield_10406",
  /** Risk/Issue Category */
  RISK_ISSUE_CATEGORY: "customfield_10327",
  /** Risk/Issue Pillar */
  RISK_ISSUE_PILLAR: "customfield_13502",
  /** Root cause */
  ROOT_CAUSE: "customfield_10721",
  /** SLA First Response Date */
  SLA_FIRST_RESPONSE_DATE: "customfield_12611",
  /** SLA First Response Status */
  SLA_FIRST_RESPONSE_STATUS: "customfield_12610",
  /** SLA First Response Time */
  SLA_FIRST_RESPONSE_TIME: "customfield_12612",
  /** SLA Name */
  SLA_NAME: "customfield_12608",
  /** SLA ON */
  SLA_ON: "customfield_12602",
  /** SLA Over Time */
  SLA_OVER_TIME: "customfield_12604",
  /** SLA Paused */
  SLA_PAUSED: "customfield_12603",
  /** SLA Percent */
  SLA_PERCENT: "customfield_12605",
  /** SLA Percent Chart */
  SLA_PERCENT_CHART: "customfield_12614",
  /** SLA Status */
  SLA_STATUS: "customfield_12606",
  /** SLA Target Date */
  SLA_TARGET_DATE: "customfield_12613",
  /** SLA Time */
  SLA_TIME: "customfield_12607",
  /** SLA Triggered Date Time */
  SLA_TRIGGERED_DATE_TIME: "customfield_12609",
  /** SLA Updated */
  SLA_UPDATED: "customfield_12601",
  /** SSD-Internal-Dept */
  SSD_INTERNAL_DEPT: "customfield_11800",
  /** SSD_Order_Effort */
  SSD_ORDER_EFFORT: "customfield_11801",
  /** SSD_Products */
  SSD_PRODUCTS: "customfield_11802",
  /** Satisfaction */
  SATISFACTION: "customfield_10706",
  /** Security Level */
  SECURITY_LEVEL: "security",
  /** Severity */
  SEVERITY: "customfield_10326",
  /** Social Media */
  SOCIAL_MEDIA: "customfield_11812",
  /** Source */
  SOURCE: "customfield_10716",
  /** Sprint */
  SPRINT: "customfield_10200",
  /** Start Date Time */
  START_DATE_TIME: "customfield_11805",
  /** Start date */
  START_DATE: "customfield_10744",
  /** Start date (WBSGantt) */
  START_DATE_WBSGANTT: "customfield_11915",
  /** Status */
  STATUS: "status",
  /** Story Points */
  STORY_POINTS: "customfield_10206",
  /** Sub-Tasks */
  SUB_TASKS: "subtasks",
  /** Summary */
  SUMMARY: "summary",
  /** TEST - Resolved => Testing */
  TEST_RESOLVED_TESTING: "customfield_12624",
  /** TEST - Testing => verified,reopened */
  TEST_TESTING_VERIFIED_REOPENED: "customfield_12625",
  /** Task mode */
  TASK_MODE: "customfield_10404",
  /** Task progress */
  TASK_PROGRESS: "customfield_10405",
  /** Team Role */
  TEAM_ROLE: "customfield_10100",
  /** Template */
  TEMPLATE: "customfield_10400",
  /** Test */
  TEST: "customfield_11704",
  /** Test_Checklist */
  TEST_CHECKLIST: "customfield_12404",
  /** Testcase Number */
  TESTCASE_NUMBER: "customfield_10739",
  /** Tháng */
  TH_NG: "customfield_13505",
  /** Time Spent */
  TIME_SPENT: "timespent",
  /** Time to approve normal change */
  TIME_TO_APPROVE_NORMAL_CHANGE: "customfield_10728",
  /** Time to close after resolution */
  TIME_TO_CLOSE_AFTER_RESOLUTION: "customfield_10727",
  /** Time to first response */
  TIME_TO_FIRST_RESPONSE: "customfield_10726",
  /** Time to resolution */
  TIME_TO_RESOLUTION: "customfield_10725",
  /** Trigger */
  TRIGGER: "customfield_10732",
  /** Trạng thái Checkout người nghỉ */
  TR_NG_TH_I_CHECKOUT_NG_I_NGH: "customfield_12405",
  /** Type of Work */
  TYPE_OF_WORK: "customfield_10340",
  /** Tạo => Duyệt */
  T_O_DUY_T: "customfield_11414",
  /** Tạo JD theo YC => Xác nhận xong chi phí */
  T_O_JD_THEO_YC_X_C_NH_N_XONG_CHI_PH: "customfield_11417",
  /** Tới giờ update Progress MBO BrSE */
  T_I_GI_UPDATE_PROGRESS_MBO_BRSE: "customfield_11910",
  /** UI Status */
  UI_STATUS: "customfield_12700",
  /** URL */
  URL: "customfield_13103",
  /** Units (WBSGantt) */
  UNITS_WBSGANTT: "customfield_11921",
  /** Updated */
  UPDATED: "updated",
  /** Upload to S3 */
  UPLOAD_TO_S3: "customfield_11703",
  /** Urgency */
  URGENCY: "customfield_10715",
  /** VAT (tiền) */
  VAT_TI_N: "customfield_12502",
  /** Votes */
  VOTES: "votes",
  /** Watchers */
  WATCHERS: "watches",
  /** Work Ratio */
  WORK_RATIO: "workratio",
  /** Workaround */
  WORKAROUND: "customfield_10722",
  /** Xác nhận yêu cầu => Tạo JD theo yêu cầu */
  X_C_NH_N_Y_U_C_U_T_O_JD_THEO_Y_U_C_U: "customfield_11416",
  /** __BSD_Dept */
  BSD_DEPT: "customfield_11574",
  /** __Branches */
  BRANCHES: "customfield_12001",
  /** __Budget */
  BUDGET: "customfield_13307",
  /** __Budget_Approver */
  BUDGET_APPROVER: "customfield_13303",
  /** __Budget_Multi_line_text */
  BUDGET_MULTI_LINE_TEXT: "customfield_13322",
  /** __Bộ phận xuất hóa đơn */
  B_PH_N_XU_T_H_A_N: "customfield_12505",
  /** __CC */
  CC: "customfield_13200",
  /** __CC_Multi_Users */
  CC_MULTI_USERS: "customfield_13301",
  /** __Checklist_for_HC */
  CHECKLIST_FOR_HC: "customfield_11569",
  /** __Cloud_vendors */
  CLOUD_VENDORS: "customfield_11579",
  /** __Customer_name */
  CUSTOMER_NAME: "customfield_13323",
  /** __Cyber_test_type */
  CYBER_TEST_TYPE: "customfield_11557",
  /** __Các_Cases_Người_Nghỉ */
  C_C_CASES_NG_I_NGH: "customfield_12630",
  /** __Depts_grouped_by_Branch */
  DEPTS_GROUPED_BY_BRANCH: "customfield_11702",
  /** __Direct_Business_Departments */
  DIRECT_BUSINESS_DEPARTMENTS: "customfield_11580",
  /** __End Date */
  END_DATE_11923: "customfield_11923",
  /** __Ghi chú */
  GHI_CH: "customfield_13311",
  /** __HR_tuyen_Paid_types */
  HR_TUYEN_PAID_TYPES: "customfield_12201",
  /** __HR_tuyển_AI_cover_percentage */
  HR_TUY_N_AI_COVER_PERCENTAGE: "customfield_13503",
  /** __HR_tuyển_work_with_AI */
  HR_TUY_N_WORK_WITH_AI: "customfield_13504",
  /** __Job order OTHER (BO, other, etc.) */
  JOB_ORDER_OTHER_BO_OTHER_ETC: "customfield_12000",
  /** __Job_Title_Short */
  JOB_TITLE_SHORT: "customfield_13400",
  /** __Job_order_Business */
  JOB_ORDER_BUSINESS: "customfield_13403",
  /** __Job_order_Delivery */
  JOB_ORDER_DELIVERY: "customfield_13404",
  /** __Job_order_Function_Dept */
  JOB_ORDER_FUNCTION_DEPT: "customfield_13405",
  /** __KZ_type */
  KZ_TYPE: "customfield_11571",
  /** __Legal_Company_name */
  LEGAL_COMPANY_NAME: "customfield_13100",
  /** __Legal_Contract_Period */
  LEGAL_CONTRACT_PERIOD: "customfield_13105",
  /** __Legal_Contract_Value */
  LEGAL_CONTRACT_VALUE: "customfield_13104",
  /** __Legal_Desired_Terms */
  LEGAL_DESIRED_TERMS: "customfield_13107",
  /** __Legal_Personal_ID */
  LEGAL_PERSONAL_ID: "customfield_13101",
  /** __Legal_Signed_by_NAME_and_POSITION */
  LEGAL_SIGNED_BY_NAME_AND_POSITION: "customfield_13106",
  /** __Legal_Tax_Code */
  LEGAL_TAX_CODE: "customfield_13109",
  /** __Level_Nhân_Sự */
  LEVEL_NH_N_S: "customfield_13314",
  /** __Loại hợp đồng */
  LO_I_H_P_NG: "customfield_13110",
  /** __MBO_Japanese */
  MBO_JAPANESE: "customfield_11903",
  /** __MBO_Target_Japanese */
  MBO_TARGET_JAPANESE: "customfield_11906",
  /** __MBO_Target_man_month_project */
  MBO_TARGET_MAN_MONTH_PROJECT: "customfield_11908",
  /** __MBO_Target_number_of_project_that_you_write_design_doc */
  MBO_TARGET_NUMBER_OF_PROJECT_THAT_YOU_WRITE_DESIGN_DOC: "customfield_11907",
  /** __MBO_Updated_Progress */
  MBO_UPDATED_PROGRESS: "customfield_11909",
  /** __MBO_man_month_project */
  MBO_MAN_MONTH_PROJECT: "customfield_11904",
  /** __MBO_number_of_project_that_you_write_design_doc */
  MBO_NUMBER_OF_PROJECT_THAT_YOU_WRITE_DESIGN_DOC: "customfield_11905",
  /** __NewCommer_Type */
  NEWCOMMER_TYPE: "customfield_11564",
  /** __Người nghiệm thu */
  NG_I_NGHI_M_THU: "customfield_12600",
  /** __Người_duyệt_cho_outsource_Package */
  NG_I_DUY_T_CHO_OUTSOURCE_PACKAGE: "customfield_13312",
  /** __Onsite_location */
  ONSITE_LOCATION: "customfield_13313",
  /** __PUR_Dept_Vendor_Approver */
  PUR_DEPT_VENDOR_APPROVER: "customfield_13305",
  /** __PUR_top_3_tieu_chi */
  PUR_TOP_3_TIEU_CHI: "customfield_13306",
  /** __Plan_End_Date */
  PLAN_END_DATE: "customfield_13310",
  /** __Purchase_Approver */
  PURCHASE_APPROVER: "customfield_13304",
  /** __Recommended_Vendors */
  RECOMMENDED_VENDORS: "customfield_13309",
  /** __Reference_link(s) */
  REFERENCE_LINK_S: "customfield_11573",
  /** __Risk_or_Legal_Approvers */
  RISK_OR_LEGAL_APPROVERS: "customfield_13324",
  /** __Risks */
  RISKS: "customfield_11572",
  /** __Role_Tuyển dụng */
  ROLE_TUY_N_D_NG: "customfield_13315",
  /** __Skill_Experience_and_Skill_Other */
  SKILL_EXPERIENCE_AND_SKILL_OTHER: "customfield_13318",
  /** __Skill_Ngoại ngữ */
  SKILL_NGO_I_NG: "customfield_13316",
  /** __Skill_Technology */
  SKILL_TECHNOLOGY: "customfield_13317",
  /** __Thăm_hỏi_nhân_viên_(type) */
  TH_M_H_I_NH_N_VI_N_TYPE: "customfield_13500",
  /** __Thời_gian_thuê_ngoài_nhân_sự */
  TH_I_GIAN_THU_NGO_I_NH_N_S: "customfield_13319",
  /** __Tiến_độ_or_Khó_khăn */
  TI_N_OR_KH_KH_N: "customfield_13401",
  /** __Tần_suất_ký_HĐ_thuê_ngoài_nhân_Sự */
  T_N_SU_T_K_H_THU_NGO_I_NH_N_S: "customfield_13320",
  /** __Yes_or_No */
  YES_OR_NO: "customfield_13308",
  /** __attachments_number */
  ATTACHMENTS_NUMBER: "customfield_12631",
  /** __flexible_time */
  FLEXIBLE_TIME: "customfield_11577",
  /** __flexible_time_HCM */
  FLEXIBLE_TIME_HCM: "customfield_11601",
  /** _nc_employee_code */
  NC_EMPLOYEE_CODE: "customfield_11542",
  /** test filed */
  TEST_FILED: "customfield_11562",
  /** Đăng trên kênh => Cập nhật vào kế hoạch */
  NG_TR_N_K_NH_C_P_NH_T_V_O_K_HO_CH: "customfield_11420",

  /** Progress (WBSGantt) — 0–100 percentage field. */
  PROGRESS_WBS_GANTT: "customfield_11919",

  /** % Done — percentage of completion. */
  PERCENT_DONE: "customfield_10338",

  /** Number of products on time (Deliverable only). */
  PRODUCTS_ON_TIME: "customfield_12304",

  /** Number of products not on time (Deliverable only). */
  PRODUCTS_NOT_ON_TIME: "customfield_12305",
};

export type CustomFieldId = (typeof CUSTOM_FIELD)[keyof typeof CUSTOM_FIELD];

/** `customfield_10339` — Project Stages */
export const PROJECT_STAGE = {
  SALE: "12624",
  REQUIREMENT: "10081",
  BASIC_DESIGN: "12185",
  DETAIL_DESIGN: "10082",
  CODING: "10083",
  TEST_UT: "12186",
  TEST_IT: "10084",
  TEST_OTHER: "12187",
  DEPLOYMENT: "10085",
  UAT: "12188",
  MAINTENANCE: "12700",
  PROJECT_PLAN: "10086",
} as const;

/** `customfield_12100` — Difficulty Level */
export const DIFFICULTY_LEVEL = {
  LEVEL_1: "12701",
  LEVEL_2: "12702",
  LEVEL_3: "12703",
} as const;

/** `customfield_10323` — Defect Type */
export const DEFECT_TYPE = {
  DATA_BUG: "10068",
  UI_BUG: "10069",
  FUNCTION_BUG: "10070",
  ENVIRONMENT_BUG: "10071",
  PERFORMANCE_BUG: "10072",
  SECURITY_BUG: "10408",
  OTHER: "10073",
} as const;

/** `customfield_10324` — Cause Category */
export const CAUSE_CATEGORY = {
  LACK_WRONG_OF_SPEC: "10017",
  LACK_WRONG_OF_DESIGN: "10018",
  CARELESSNESS: "10019",
  LACK_OF_SKILL: "10020",
  MISSING_COMMUNICATION: "10021",
  PROCESS_NON_COMPLIANCE: "10022",
  TRANSLATE: "10023",
  OTHER: "10024",
} as const;

/** `customfield_10326` — Severity */
export const SEVERITY = {
  CRITICAL: "10025",
  MAJOR: "10026",
  NORMAL: "10028",
  MINOR: "10027",
} as const;

/** `customfield_10336` — Defect Origin */
export const DEFECT_ORIGIN = {
  REQUIREMENT: "10061",
  DESIGN: "10062",
  CODING: "10063",
  TESTING: "10064",
  DEPLOYMENT: "10065",
  CUSTOMER_SUPPORT: "10066",
  OUT_OF_SCOPE: "10200",
  OTHER: "10067",
} as const;

/** `customfield_10332` — Impact (Change Request) */
export const IMPACT = {
  HIGH: "10055",
  MEDIUM: "10056",
  LOW: "10057",
} as const;

/** `customfield_12303` — FI Result (Deliverable) */
export const FI_RESULT = {
  PASSED: "13019",
  FAILED: "13020",
} as const;

/**
 * `customfield_10335` — Degrade (radio button, required for Bug/Bug_Customer/Leakage).
 * Indicates whether the defect caused a regression.
 */
export const DEGRADE = {
  YES: "10059",
  NO: "10060",
} as const;

/**
 * `customfield_11568` — Has Bill for CR (radio button, required for Change Request).
 * Indicates whether the change request has an associated bill.
 */
export const HAS_BILL_FOR_CR = {
  UNDEFINED: "12500",
  YES: "12145",
  NO: "12146",
} as const;

/** `customfield_12801` — Leakage Type */
export const LEAKAGE_TYPE = {
  UT: "13506",
  IT: "13507",
  ST: "13508",
} as const;

/** `customfield_10731` — Likelihood (Risk) */
export const LIKELIHOOD = {
  HIGH: "10402",
  MEDIUM: "10403",
  LOW: "10404",
} as const;

/** `customfield_10735` — Risk Level (Risk) */
export const RISK_LEVEL = {
  HIGH: "10405",
  MEDIUM: "10406",
  LOW: "10407",
} as const;

/** `customfield_10327` — Risk/Issue Category (Risk) */
export const RISK_ISSUE_CATEGORY = {
  CUSTOMER: "10029",
  HUMAN_RESOURCE: "10030",
  ENVIRONMENT: "10031",
  PROJECT_MANAGEMENT: "10032",
  PROJECT_REQUIREMENT: "10033",
  TECHNICAL: "10034",
  PROJECT_DEPENDENCIES: "10036",
  OPERATIONAL: "14401",
  SECURITY: "10037",
  OTHER: "10039",
} as const;

/** `customfield_10329` — Handling Option (Risk, optional) */
export const HANDLING_OPTION = {
  ACCEPT: "10048",
  AVOID: "10046",
  MITIGATE: "10047",
  TRANSFER: "10049",
} as const;

/** `customfield_12005` — Incident Type */
export const INCIDENT_TYPE = {
  INFRASTRUCTURE: "12634",
  SECURITY: "12635",
  DISASTER: "12636",
  VIOLATION_AGREEMENT: "12637",
  PROGRESS: "12638",
  QUALITY: "12639",
  OTHER: "12640",
} as const;

/** `customfield_12006` — Incident Scope (radio) */
export const INCIDENT_SCOPE = {
  INTERNAL: "12641",
  EXTERNAL: "12642",
} as const;

/** `customfield_12003` — Affected Objects (multi-checkbox) */
export const AFFECTED_OBJECTS = {
  PROJECT_TEAM: "12628",
  OWNER_DEPARTMENT: "12629",
  OTHER_DEPARTMENT: "12704",
  ORGANIZATION: "12630",
  CUSTOMER: "12631",
  PARTNER: "12632",
  OTHER: "12633",
} as const;

/** Standard `priority` field */
export const PRIORITY = {
  HIGHEST: "1",
  HIGH: "2",
  MEDIUM: "3",
  LOW: "4",
  LOWEST: "5",
  BLOCKER: "10100",
  MINOR: "10101",
} as const;

/** Standard `resolution` field */
export const RESOLUTION = {
  DOING: "10201",
  FIXED: "10301",
  DONE: "10000",
  NOT_A_BUG: "10101",
  DUPLICATE: "10002",
  CANNOT_REPRODUCE: "10100",
  PENDING: "10302",
  NEED_CONFIRMED: "10303",
  UNRESOLVED: "10306",
  WONT_DO: "10312",
  DECLINED: "10404",
  KNOWN_ERROR: "10405",
  HARDWARE_FAILURE: "10406",
  SOFTWARE_FAILURE: "10407",
} as const;

/** Project components (DNIEM project) */
export const COMPONENT = {
  QA: "10118",
  SUPPORT_CUSTOMER: "10145",
  OTHER: "10146",
  ECS: "10231",
  ECS_DIGITALLAB_COMMON: "13120",
  ECS_REGISTRY: "13246",
  ECS_TRAINING: "14549",
  TRANSLATE_PROJECT: "10346",
  PROJECT_MANAGEMENT: "10347",
  TOOL_NOI_BO: "10908",
  CASE_STUDY_SECURITY: "10932",
  RUBY: "11309",
  RUBY_RKKCS: "13834",
  RUBY_SHIENOWA: "13833",
  RUBY_LIM: "13527",
  TRAINING_FRESHER: "11320",
  QC: "11321",
  TRAINER: "11439",
  TRAINING_LOWCODE: "11802",
  LOWCODE: "13103",
  KAIZEN: "14037",
  DU2_TECHNICAL_TRAINING: "16016",
  DU3: "15956",
  DU3_RESEARCH: "15918",
  ECS_PRE_SALES: "15600",
  PRE_SALES: "15926",
  QA_COMPONENT: "14376",
} as const;

/**
 * Maps each issue type to its required field IDs.
 * Use this to validate a create-issue payload before sending to the API.
 */
export const REQUIRED_FIELDS: Record<IssueTypeId, readonly string[]> = {
  [ISSUE_TYPE.TASK]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    FIELD.SUMMARY,
    CUSTOM_FIELD.DIFFICULTY_LEVEL,
    CUSTOM_FIELD.PROJECT_STAGES,
    FIELD.DUE_DATE,
  ],
  [ISSUE_TYPE.BUG]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    FIELD.SUMMARY,
    CUSTOM_FIELD.PROJECT_STAGES,
    CUSTOM_FIELD.DEGRADE,
    FIELD.DUE_DATE,
    CUSTOM_FIELD.DEFECT_TYPE,
  ],
  [ISSUE_TYPE.BUG_CUSTOMER]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    FIELD.SUMMARY,
    CUSTOM_FIELD.PROJECT_STAGES,
    CUSTOM_FIELD.DEGRADE,
    FIELD.DUE_DATE,
    CUSTOM_FIELD.DEFECT_TYPE,
  ],
  [ISSUE_TYPE.IMPROVEMENT]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    FIELD.SUMMARY,
    FIELD.DUE_DATE,
  ],
  [ISSUE_TYPE.DELIVERABLE]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    FIELD.SUMMARY,
    CUSTOM_FIELD.PROJECT_STAGES,
    FIELD.DUE_DATE,
  ],
  [ISSUE_TYPE.EPIC]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    CUSTOM_FIELD.EPIC_NAME,
    FIELD.SUMMARY,
    CUSTOM_FIELD.DIFFICULTY_LEVEL,
    CUSTOM_FIELD.PROJECT_STAGES,
    FIELD.DUE_DATE,
  ],
  [ISSUE_TYPE.QA]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    FIELD.SUMMARY,
    FIELD.DUE_DATE,
  ],
  [ISSUE_TYPE.LEAKAGE]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    FIELD.SUMMARY,
    CUSTOM_FIELD.PROJECT_STAGES,
    CUSTOM_FIELD.DEGRADE,
    FIELD.DUE_DATE,
    CUSTOM_FIELD.DEFECT_TYPE,
  ],
  [ISSUE_TYPE.CHANGE_REQUEST]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    FIELD.SUMMARY,
    CUSTOM_FIELD.DIFFICULTY_LEVEL,
    CUSTOM_FIELD.PROJECT_STAGES,
    FIELD.DUE_DATE,
    CUSTOM_FIELD.IMPACT,
    CUSTOM_FIELD.HAS_BILL_FOR_CR,
  ],
  [ISSUE_TYPE.STORY]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    FIELD.SUMMARY,
    CUSTOM_FIELD.DIFFICULTY_LEVEL,
    CUSTOM_FIELD.PROJECT_STAGES,
    FIELD.DUE_DATE,
  ],
  // Issue types with known form metadata:
  [ISSUE_TYPE.FEEDBACK]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    FIELD.SUMMARY,
    CUSTOM_FIELD.PROJECT_STAGES,
    FIELD.DUE_DATE,
  ],
  [ISSUE_TYPE.INCIDENT]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    FIELD.SUMMARY,
    FIELD.DUE_DATE,
    CUSTOM_FIELD.AFFECTED_OBJECTS,
    CUSTOM_FIELD.DISCOVERY_DATE,
    CUSTOM_FIELD.INCIDENT_TYPE,
    CUSTOM_FIELD.INCIDENT_SCOPE,
  ],
  [ISSUE_TYPE.RISK]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    FIELD.SUMMARY,
    CUSTOM_FIELD.RISK_OWNER,
    CUSTOM_FIELD.IMPACT,
    CUSTOM_FIELD.LIKELIHOOD,
    CUSTOM_FIELD.RISK_LEVEL,
    CUSTOM_FIELD.RISK_ISSUE_CATEGORY,
  ],
  [ISSUE_TYPE.REVIEW_COMMENT]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    FIELD.SUMMARY,
    CUSTOM_FIELD.PROJECT_STAGES,
    FIELD.DUE_DATE,
  ],
  // Issue types without dedicated form metadata — minimal required fields:
  [ISSUE_TYPE.OPPORTUNITY]: [FIELD.PROJECT, FIELD.ISSUE_TYPE, FIELD.SUMMARY],
  [ISSUE_TYPE.ISSUE]: [FIELD.PROJECT, FIELD.ISSUE_TYPE, FIELD.SUMMARY],
  [ISSUE_TYPE.NEW_FEATURE]: [FIELD.PROJECT, FIELD.ISSUE_TYPE, FIELD.SUMMARY],
  [ISSUE_TYPE.LESSON_PRACTICE]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    FIELD.SUMMARY,
  ],
  [ISSUE_TYPE.COMTOR_TASK]: [FIELD.PROJECT, FIELD.ISSUE_TYPE, FIELD.SUMMARY],
  [ISSUE_TYPE.DEPENDENCY]: [FIELD.PROJECT, FIELD.ISSUE_TYPE, FIELD.SUMMARY],
  [ISSUE_TYPE.PROJECT_TRAINING]: [
    FIELD.PROJECT,
    FIELD.ISSUE_TYPE,
    FIELD.SUMMARY,
  ],
  [ISSUE_TYPE.NC]: [FIELD.PROJECT, FIELD.ISSUE_TYPE, FIELD.SUMMARY],
  [ISSUE_TYPE.MA]: [FIELD.PROJECT, FIELD.ISSUE_TYPE, FIELD.SUMMARY],
  [ISSUE_TYPE.REVIEW_DEFECT]: [FIELD.PROJECT, FIELD.ISSUE_TYPE, FIELD.SUMMARY],
} as const;

const COMMON_OPTIONAL_FIELDS = [
  FIELD.DESCRIPTION,
  FIELD.ASSIGNEE,
  FIELD.PRIORITY,
  FIELD.COMPONENTS,
  FIELD.LABELS,
  FIELD.FIX_VERSIONS,
  FIELD.AFFECTS_VERSIONS,
  FIELD.TIME_TRACKING,
] as const;

const BUG_FAMILY_OPTIONAL_FIELDS = [
  CUSTOM_FIELD.DEFECT_OWNER,
  CUSTOM_FIELD.DEFECT_ORIGIN,
  CUSTOM_FIELD.CAUSE_CATEGORY,
  CUSTOM_FIELD.SEVERITY,
  CUSTOM_FIELD.IMPACT_ASSESSMENT,
  CUSTOM_FIELD.CAUSE_ANALYSIS,
  CUSTOM_FIELD.ACTION,
  CUSTOM_FIELD.DOD,
] as const;

const INCIDENT_OPTIONAL_FIELDS = [
  CUSTOM_FIELD.CONTROL_MEASURES,
  CUSTOM_FIELD.CONTINGENCY_ACTION,
] as const;

const RISK_OPTIONAL_FIELDS = [
  CUSTOM_FIELD.HANDLING_OPTION,
  CUSTOM_FIELD.CONTROL_MEASURES,
  CUSTOM_FIELD.CONTINGENCY_ACTION,
] as const;

export const OPTIONAL_FIELDS: Record<IssueTypeId, readonly string[]> = {
  [ISSUE_TYPE.TASK]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.BUG]: [...COMMON_OPTIONAL_FIELDS, ...BUG_FAMILY_OPTIONAL_FIELDS],
  [ISSUE_TYPE.BUG_CUSTOMER]: [...COMMON_OPTIONAL_FIELDS, ...BUG_FAMILY_OPTIONAL_FIELDS],
  [ISSUE_TYPE.IMPROVEMENT]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.DELIVERABLE]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.EPIC]: [...COMMON_OPTIONAL_FIELDS, FIELD.DESCRIPTION, FIELD.LABELS],
  [ISSUE_TYPE.QA]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.LEAKAGE]: [...COMMON_OPTIONAL_FIELDS, ...BUG_FAMILY_OPTIONAL_FIELDS],
  [ISSUE_TYPE.CHANGE_REQUEST]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.STORY]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.FEEDBACK]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.INCIDENT]: [...COMMON_OPTIONAL_FIELDS, ...INCIDENT_OPTIONAL_FIELDS],
  [ISSUE_TYPE.RISK]: [...COMMON_OPTIONAL_FIELDS, ...RISK_OPTIONAL_FIELDS],
  [ISSUE_TYPE.REVIEW_COMMENT]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.OPPORTUNITY]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.ISSUE]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.NEW_FEATURE]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.LESSON_PRACTICE]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.COMTOR_TASK]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.DEPENDENCY]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.PROJECT_TRAINING]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.NC]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.MA]: COMMON_OPTIONAL_FIELDS,
  [ISSUE_TYPE.REVIEW_DEFECT]: COMMON_OPTIONAL_FIELDS,
} as const;

export function getAllowedFields(issueTypeId: IssueTypeId): readonly string[] {
  const required = REQUIRED_FIELDS[issueTypeId].filter((fieldId) => fieldId !== FIELD.ISSUE_TYPE);
  return [...required, ...OPTIONAL_FIELDS[issueTypeId]];
}
