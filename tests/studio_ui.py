"""Actions shared by browser checks for the scene-to-publication workflow."""

def choose_scene(page, key):
    page.get_by_role('button',name='选择场景',exact=True).click()
    page.get_by_role('button',name='选择场景 '+key,exact=True).click()
    page.get_by_role('button',name='使用该场景',exact=True).click()


def open_data(page):
    page.get_by_role('button',name='数据绑定',exact=True).click()
    page.get_by_role('button',name='数据连接',exact=True).click()


def publish(page):
    page.locator('.studio-header').get_by_role('button',name='预览发布',exact=True).click()
    page.locator('.studio-header').get_by_role('button',name='发布',exact=True).click()


def project_action(page, name):
    menu=page.locator('.project-menu')
    if menu.get_attribute('open') is None:
        menu.locator('summary').click()
    menu.get_by_role('button',name=name,exact=True).click()
