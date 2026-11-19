const { createApp, ref, computed, onMounted, nextTick } = Vue;
const projectUrl = (path, project) => path + "?project=" + encodeURIComponent(project.id);
const tabFromUrl = () => new URLSearchParams(location.search).get("tab") === "cases" ? "cases" : "projects";
const caseFromUrl = () => new URLSearchParams(location.search).get("case") || "";
const dateFormatter = new Intl.DateTimeFormat("zh-CN", { dateStyle:"medium", timeStyle:"short" });
const sourceNames = {
  json:"本地 JSON", csv:"本地 CSV", rest:"HTTP 接口", ws:"WebSocket",
  opcua:"OPC UA", modbus:"Modbus TCP",
};

async function requestProjects(path, data) {
  const response = await fetch(path, data === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "请求失败");
  return result;
}

createApp({
  setup() {
    const projects = ref([]), cases = ref([]), tab = ref(tabFromUrl());
    const query = ref(""), category = ref(""), linkedCase = ref(caseFromUrl());
    const loading = ref(true), notice = ref(""), error = ref(""), busy = ref(false);
    const importInput = ref(), formDialog = ref(), nameInput = ref();
    const form = ref({ mode:"create", item:null, name:"" });

    const caseIndex = computed(() => new Map(cases.value.map(item => [item.id, item])));
    const caseFor = project => caseIndex.value.get(project.caseId);
    const caseProjects = item => projects.value.filter(project => project.caseId === item.id);
    const categories = computed(() => [...new Map(cases.value.map(item => [item.category,item.categoryLabel]))]
      .map(([id,name]) => ({ id,name })));
    const matches = text => text.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase());
    const visibleCases = computed(() => cases.value.filter(item =>
      (!category.value || item.category === category.value) &&
      matches([item.id,item.number,item.title,item.categoryLabel].join(" "))));
    const visibleProjects = computed(() => projects.value.filter(project =>
      (!linkedCase.value || project.caseId === linkedCase.value) &&
      matches([project.name,project.caseId,caseFor(project)?.title].join(" "))));
    const formTitle = computed(() => ({ create:"新建工程", rename:"重命名工程", copy:"复制工程草稿", case:"新建关联工程" })[form.value.mode]);

    function navigate(nextTab) {
      const nextUrl = nextTab === "cases" ? "/projects?tab=cases" : "/projects";
      if (location.pathname + location.search !== nextUrl) history.pushState({}, "", nextUrl);
      tab.value = nextTab;
      query.value = "";
      linkedCase.value = "";
      notice.value = "";
    }

    // Search results for a case remain ordinary projects, with the same edit and publish actions.
    function showLinked(item) {
      navigate("projects");
      linkedCase.value = item.id;
      history.replaceState({}, "", "/projects?case=" + encodeURIComponent(item.id));
    }

    async function load() {
      try {
        const data = await requestProjects("/api/projects");
        projects.value = data.projects;
        cases.value = data.cases;
      } catch (e) {
        notice.value = "无法读取工作区 · " + e.message;
      } finally {
        loading.value = false;
      }
    }

    function openForm(mode, item = null, event) {
      if (event) event.target.closest("details")?.removeAttribute("open");
      const name = mode === "rename" ? item.name : mode === "copy" ? item.name.slice(0,77) + " 副本" :
        mode === "case" ? item.number + " " + item.title : "";
      form.value = { mode, item, name };
      error.value = "";
      formDialog.value.showModal();
      void nextTick(() => nameInput.value.focus());
    }

    async function submit() {
      if (busy.value) return;
      const { mode, item, name } = form.value;
      busy.value = true;
      error.value = "";
      try {
        if (mode === "rename") {
          await requestProjects("/api/projects/rename", { id:item.id, name });
          formDialog.value.close();
          await load();
        } else {
          const project = await requestProjects("/api/projects", {
            name, from:mode === "copy" ? item.id : undefined, caseId:mode === "case" ? item.id : undefined,
          });
          location.href = projectUrl("/editor", project);
        }
      } catch (e) {
        error.value = e.message;
      } finally {
        busy.value = false;
      }
    }

    async function importProject(event) {
      const file = event.target.files[0];
      event.target.value = "";
      if (!file || busy.value) return;
      busy.value = true;
      notice.value = "";
      try {
        const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
        const project = await requestProjects("/api/projects", { doc:parsed.draft || parsed });
        location.href = projectUrl("/editor", project);
      } catch (e) {
        notice.value = "导入失败 · " + e.message;
      } finally {
        busy.value = false;
      }
    }

    onMounted(() => {
      window.addEventListener("popstate", () => {
        tab.value = tabFromUrl();
        query.value = "";
        linkedCase.value = caseFromUrl();
      });
      void load();
    });
    return {
      tab, projects, cases, query, category, categories, linkedCase, loading, notice, form, busy, error,
      importInput, formDialog, nameInput, sourceNames, visibleCases, visibleProjects, formTitle,
      caseFor, caseProjects, navigate, showLinked, openForm, importProject, submit,
      editorUrl: project => projectUrl("/editor", project),
      viewUrl: project => projectUrl("/view", project),
      formatDate: date => dateFormatter.format(new Date(date)),
      hideImage: event => { event.target.hidden = true; },
    };
  },
}).mount("#portal");
