-- Synthetic layout fixtures ONLY, never real publication content.
INSERT INTO books(id,title,author,category,description,cover_title,cover_author) VALUES('theme-long-book','长标题排版测试：我们如何在有限的空间里完整呈现阅读内容以及NeverTruncateAnUnbrokenVeryLongBookTitleForLayoutTesting','仅用于界面验收的测试作者','界面与长类别换行测试','此书目仅为界面测试，不是真实书籍资料。
这段长简介用于核对完整显示、换行与文字放大后的阅读体验。这段长简介用于核对完整显示、换行与文字放大后的阅读体验。这段长简介用于核对完整显示、换行与文字放大后的阅读体验。这段长简介用于核对完整显示、换行与文字放大后的阅读体验。这段长简介用于核对完整显示、换行与文字放大后的阅读体验。这段长简介用于核对完整显示、换行与文字放大后的阅读体验。这段长简介用于核对完整显示、换行与文字放大后的阅读体验。这段长简介用于核对完整显示、换行与文字放大后的阅读体验。这段长简介用于核对完整显示、换行与文字放大后的阅读体验。这段长简介用于核对完整显示、换行与文字放大后的阅读体验。这段长简介用于核对完整显示、换行与文字放大后的阅读体验。这段长简介用于核对完整显示、换行与文字放大后的阅读体验。
https://example.invalid/unbroken-segmentunbroken-segmentunbroken-segmentunbroken-segmentunbroken-segmentunbroken-segmentunbroken-segmentunbroken-segmentunbroken-segmentunbroken-segmentunbroken-segmentunbroken-segment
<script>window.__themeXSS=true</script>','长标题
文字封面
保留原始换行
不截断任何内容
测试用书','VERY_LONG_TEST_AUTHOR_WITHOUT_BREAKS_FOR_REFLOW');
INSERT INTO issues(id,book_id,status,publication_date,issue_number,body) VALUES('theme-long','theme-long-book','published','2026-09-02',130,'BODY_NOT_FOR_SSR_THEME_LONG');
INSERT INTO books(id,title,author,category,description,cover_title,cover_author) VALUES('theme-missing-book','缺项与单条书摘测试','测试作者','测试','这是假定的缺项界面数据，不作为真实书籍推荐。','缺项测试','');
INSERT INTO issues(id,book_id,status,publication_date,issue_number,editor_note,body) VALUES('theme-missing','theme-missing-book','published','2026-09-01',131,NULL,'BODY_NOT_FOR_SSR_THEME_MISSING');
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-single-q','theme-missing','仅用于单条书摘布局测试。','界面测试，非真实引文',0);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-long-q0','theme-long','第1条界面测试书摘，非真实引用。
完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。','测试来源，不是实际书页：1',0);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-long-q1','theme-long','第2条界面测试书摘，非真实引用。
完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。','测试来源，不是实际书页：2',1);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-long-q2','theme-long','第3条界面测试书摘，非真实引用。
完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。','测试来源，不是实际书页：3',2);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-long-q3','theme-long','第4条界面测试书摘，非真实引用。
完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。','测试来源，不是实际书页：4',3);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-long-q4','theme-long','第5条界面测试书摘，非真实引用。
完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。','测试来源，不是实际书页：5',4);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-long-q5','theme-long','第6条界面测试书摘，非真实引用。
完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。','测试来源，不是实际书页：6',5);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-long-q6','theme-long','第7条界面测试书摘，非真实引用。
完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。','测试来源，不是实际书页：7',6);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-long-q7','theme-long','第8条界面测试书摘，非真实引用。
完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。','测试来源，不是实际书页：8',7);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-long-q8','theme-long','第9条界面测试书摘，非真实引用。
完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。','测试来源，不是实际书页：9',8);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-long-q9','theme-long','第10条界面测试书摘，非真实引用。
完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。','测试来源，不是实际书页：10',9);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-long-q10','theme-long','第11条界面测试书摘，非真实引用。
完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。','测试来源，不是实际书页：11',10);
INSERT INTO quotes(id,issue_id,text,source_label,position) VALUES('theme-long-q11','theme-long','第12条界面测试书摘，非真实引用。
完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。完整文字和有序来源应在移动端与放大后继续可读。','测试来源，不是实际书页：12',11);
INSERT INTO issues(id,book_id,status,publication_date,issue_number,body) VALUES('theme-zero','theme-missing-book','published','2026-08-01',132,'BODY_NOT_FOR_SSR_THEME_ZERO');
