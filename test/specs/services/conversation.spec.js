import sinon from 'sinon';

import { createMock } from '../../mocks/core';
import { createMockedStore } from '../../utils/redux';

import * as utilsDevice from '../../../src/js/utils/device';
import * as utilsMedia from '../../../src/js/utils/media';
import * as utilsUser from '../../../src/js/utils/user';
import * as conversationService from '../../../src/js/services/conversation';
import * as coreService from '../../../src/js/services/core';
import * as userService from '../../../src/js/services/user';
import * as appService from '../../../src/js/services/app';
import * as fayeService from '../../../src/js/services/faye';
import * as appStateActions from '../../../src/js/actions/app-state-actions';
import * as conversationActions from '../../../src/js/actions/conversation-actions';
import * as userActions from '../../../src/js/actions/user-actions';
import * as fayeActions from '../../../src/js/actions/faye-actions';

function getProps(props = {}) {
    const defaultProps = {
        user: {
            clients: {},
            email: 'hello@smooch.io'
        },
        app: {
            integrations: [
                {
                    _id: '12241',
                    type: 'telegram',
                    username: 'chloebot'
                }
            ],
            settings: {
                web: {
                    channels: {
                        telegram: true,
                        messenger: false,
                        line: false,
                        twilio: false,
                        wechat: false
                    }
                }
            }
        },
        conversation: {
            messages: []
        },
        appState: {
            emailCaptureEnabled: true
        },
        faye: {
            userSubscription: null,
            conversationSubscription: null
        }
    };

    return Object.assign({}, defaultProps, props);
}

describe('Conversation service', () => {
    let sandbox;
    let coreMock;
    let mockedStore;
    let fayeSubscriptionMock;
    let userSubscriptionMock;

    before(() => {
        sandbox = sinon.sandbox.create();
    });

    beforeEach(() => {
        coreMock = createMock(sandbox);
        coreMock.appUsers.getMessages.resolves({
            conversation: {
            },
            messages: []
        });

        sandbox.stub(coreService, 'core', () => {
            return coreMock;
        });

        fayeSubscriptionMock = {
            cancel: sandbox.stub().resolves()
        };

        userSubscriptionMock = {
            cancel: sandbox.stub().resolves()
        };

        sandbox.stub(fayeService, 'disconnectClient').returns(null);
        sandbox.stub(fayeService, 'subscribeConversation').resolves();
        sandbox.stub(fayeService, 'subscribeConversationActivity').resolves();
        sandbox.stub(fayeService, 'subscribeUser').resolves();
        sandbox.stub(utilsMedia, 'isImageUploadSupported').returns(true);
        sandbox.stub(utilsMedia, 'isFileTypeSupported');
        sandbox.stub(utilsMedia, 'resizeImage');
        sandbox.stub(utilsMedia, 'getBlobFromDataUrl').returns('this-is-a-blob');
        sandbox.stub(utilsDevice, 'getDeviceId').returns('1234');
        sandbox.stub(utilsUser, 'hasLinkableChannels').returns(true);
        sandbox.stub(utilsUser, 'isChannelLinked').returns(false);

        sandbox.stub(appService, 'showConnectNotification');
        sandbox.stub(userService, 'immediateUpdate').resolves();

        sandbox.stub(conversationActions, 'setConversation');
        sandbox.stub(conversationActions, 'replaceMessage');
        sandbox.stub(conversationActions, 'addMessage');
        sandbox.stub(conversationActions, 'removeMessage');
        sandbox.stub(conversationActions, 'resetUnreadCount');
        sandbox.stub(userActions, 'updateUser');
        sandbox.stub(appStateActions, 'showErrorNotification');
        sandbox.stub(fayeActions, 'unsetFayeSubscriptions');
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('handleConnectNotification', () => {
        it('should show connect notification on first appuser message', () => {
            mockedStore = createMockedStore(sandbox, getProps({
                conversation: {
                    messages: [
                        {
                            received: 1,
                            role: 'appUser'
                        }
                    ]
                }
            }));

            mockedStore.dispatch(conversationService.handleConnectNotification({}));
            appService.showConnectNotification.should.have.been.calledOnce;
        });

        it('should show connect notification 24 hours later', () => {
            mockedStore = createMockedStore(sandbox, getProps({
                conversation: {
                    messages: [
                        {
                            received: 1,
                            role: 'appUser'
                        },
                        {
                            received: Date.now(),
                            role: 'appUser'
                        }
                    ]
                }
            }));

            mockedStore.dispatch(conversationService.handleConnectNotification({}));
            appService.showConnectNotification.should.have.been.calledOnce;

        });

        it('should not show connect notification if it\'s been less than 24 hours', () => {
            mockedStore = createMockedStore(sandbox, getProps({
                conversation: {
                    messages: [
                        {
                            received: Date.now() + 1,
                            role: 'appUser'
                        },
                        {
                            received: Date.now() + 2,
                            role: 'appUser'
                        }
                    ]
                }
            }));

            mockedStore.dispatch(conversationService.handleConnectNotification({}));
            appService.showConnectNotification.should.not.have.been.called;
        });
    });

    describe('sendMessage', () => {
        const message = {
            conversation: 'conversation',
            _clientId: 2,
            message: 'message'
        };

        beforeEach(() => {
            coreMock.appUsers.sendMessage.resolves(message);
        });

        describe('conversation started', () => {
            beforeEach(() => {
                mockedStore = createMockedStore(sandbox, getProps({
                    user: {
                        _id: '1',
                        conversationStarted: true
                    }
                }));
            });

            it('should replace message', () => {
                return mockedStore.dispatch(conversationService.sendMessage('message')).then(() => {
                    userService.immediateUpdate.should.have.been.calledOnce;

                    coreMock.appUsers.sendMessage.should.have.been.calledWithMatch('1', {
                        text: 'message',
                        role: 'appUser'
                    });

                    conversationActions.addMessage.should.have.been.called;
                    conversationActions.setConversation.should.not.have.been.called;
                    conversationActions.replaceMessage.should.have.been.called;
                    userActions.updateUser.should.not.have.been.called;
                });
            });
        });

        describe('conversation not started', () => {
            beforeEach(() => {
                mockedStore = createMockedStore(sandbox, getProps({
                    user: {
                        _id: '1',
                        conversationStated: false
                    }
                }));
            });

            it('should set conversation to started', () => {
                return mockedStore.dispatch(conversationService.sendMessage('message')).then(() => {
                    userService.immediateUpdate.should.have.been.calledOnce;

                    coreMock.appUsers.sendMessage.should.have.been.calledWithMatch('1', {
                        text: 'message',
                        role: 'appUser'
                    });

                    conversationActions.addMessage.should.have.been.called;
                    conversationActions.setConversation.should.have.been.called;
                    conversationActions.replaceMessage.should.have.been.called;
                    userActions.updateUser.should.have.been.called;
                });
            });
        });

        describe('errors', () => {
            it('should show an error notification', () => {
                mockedStore = createMockedStore(sandbox, getProps());
                return mockedStore.dispatch(conversationService.sendMessage('message')).catch(() => {
                    appStateActions.showErrorNotification.should.have.been.called;
                    conversationActions.removeMessage.should.have.been.called;
                });
            });
        });
    });

    describe('uploadImage', () => {
        const image = {
            conversation: 'conversation'
        };

        beforeEach(() => {
            coreMock.appUsers.uploadImage.resolves(image);
        });

        describe('conversation started', () => {
            beforeEach(() => {
                mockedStore = createMockedStore(sandbox, getProps({
                    user: {
                        _id: '1',
                        conversationStarted: true
                    }
                }));
                utilsMedia.isFileTypeSupported.returns(true);
                utilsMedia.resizeImage.resolves({});
            });

            it('should replace image', () => {
                return mockedStore.dispatch(conversationService.uploadImage({})).then(() => {
                    userService.immediateUpdate.should.have.been.calledOnce;

                    coreMock.appUsers.uploadImage.should.have.been.calledWithMatch('1', 'this-is-a-blob', {
                        role: 'appUser',
                        deviceId: '1234'
                    });

                    conversationActions.setConversation.should.not.have.been.called;
                    conversationActions.replaceMessage.should.have.been.called;
                    userActions.updateUser.should.not.have.been.called;
                });
            });
        });

        describe('conversation not started', () => {
            beforeEach(() => {
                mockedStore = createMockedStore(sandbox, getProps({
                    user: {
                        _id: '1',
                        conversationStarted: false
                    }
                }));
                utilsMedia.isFileTypeSupported.returns(true);
                utilsMedia.resizeImage.resolves({});
            });

            it('should set conversation to started', () => {
                return mockedStore.dispatch(conversationService.uploadImage({})).then(() => {
                    userService.immediateUpdate.should.have.been.calledOnce;

                    coreMock.appUsers.uploadImage.should.have.been.calledWithMatch('1', 'this-is-a-blob', {
                        role: 'appUser'
                    });

                    conversationActions.setConversation.should.have.been.called;
                    conversationActions.replaceMessage.should.have.been.called;
                    userActions.updateUser.should.have.been.called;
                });
            });
        });

        describe('errors', () => {
            beforeEach(() => {
                mockedStore = createMockedStore(sandbox, getProps({
                    user: {
                        _id: '1',
                        conversationStarted: true
                    },
                    ui: {
                        text: {
                            invalidFileError: 'invalidFileError'
                        }
                    }
                }));
            });

            describe('unsupported file type', () => {
                beforeEach(() => {
                    coreMock.appUsers.uploadImage.resolves({
                        conversation: 'conversation'
                    });
                    utilsMedia.isFileTypeSupported.returns(false);
                    utilsMedia.resizeImage.resolves({});
                });

                it('should show an error notification', () => {
                    return mockedStore.dispatch(conversationService.uploadImage({})).catch(() => {
                        appStateActions.showErrorNotification.should.have.been.called;
                    });
                });
            });

            describe('resize error', () => {
                beforeEach(() => {
                    coreMock.appUsers.uploadImage.resolves({
                        conversation: 'conversation'
                    });
                    utilsMedia.isFileTypeSupported.returns(true);
                    utilsMedia.resizeImage.rejects();
                });

                it('should show an error notification', () => {
                    return mockedStore.dispatch(conversationService.uploadImage({})).catch(() => {
                        appStateActions.showErrorNotification.should.have.been.called;
                    });
                });
            });

            describe('upload error', () => {
                beforeEach(() => {
                    utilsMedia.isFileTypeSupported.returns(true);
                    utilsMedia.resizeImage.resolves({});
                    coreMock.appUsers.uploadImage.rejects();
                });

                it('should show an error notification', () => {
                    return mockedStore.dispatch(conversationService.uploadImage({})).catch(() => {
                        appStateActions.showErrorNotification.should.have.been.called;
                        conversationActions.removeMessage.should.have.been.called;
                    });
                });
            });
        });
    });

    describe('getMessages', () => {
        beforeEach(() => {
            mockedStore = createMockedStore(sandbox, {
                user: {
                    _id: '1'
                }
            });
        });

        it('should call smooch-core conversation api and dispatch conversation', () => {
            return mockedStore.dispatch(conversationService.getMessages()).then((response) => {
                coreMock.appUsers.getMessages.should.have.been.calledWith('1');

                response.should.deep.eq({
                    conversation: {
                    },
                    messages: []
                });

                conversationActions.setConversation.should.have.been.called;
            });
        });
    });

    describe('connectFayeConversation', () => {
        [true, false].forEach((active) => {
            describe(`with${active ? '' : 'out'} subscription active`, () => {
                it(`should ${active ? 'not' : ''} subscribe to conversation`, () => {
                    mockedStore = active ? createMockedStore(sandbox, getProps({
                        faye: {
                            conversationSubscription: fayeSubscriptionMock
                        }
                    })) : createMockedStore(sandbox, getProps());

                    return mockedStore.dispatch(conversationService.connectFayeConversation()).then(() => {
                        if (active) {
                            fayeService.subscribeConversation.should.not.have.been.called;
                        } else {
                            fayeService.subscribeConversation.should.have.been.calledOnce;
                        }
                    });
                });
            });
        });
    });

    describe('connectFayeUser', () => {
        [true, false].forEach((subscribed) => {
            describe(`user ${subscribed ? '' : 'not'} subscribed`, () => {
                it(`should ${subscribed ? 'not' : ''} subscribe user`, () => {
                    mockedStore = subscribed ? createMockedStore(sandbox, getProps({
                        faye: {
                            userSubscription: userSubscriptionMock
                        }
                    })) : createMockedStore(sandbox, getProps());

                    return mockedStore.dispatch(conversationService.connectFayeUser()).then(() => {
                        if (subscribed) {
                            fayeService.subscribeUser.should.have.not.been.called;
                        } else {
                            fayeService.subscribeUser.should.have.been.calledOnce;
                        }
                    });
                });
            });
        });
    });

    describe('disconnectFaye', () => {
        [true, false].forEach((active) => {
            describe(`with${active ? '' : 'out'} subscription active`, () => {
                it(`should ${active ? '' : 'not'} cancel subscription`, () => {
                    mockedStore = active ? createMockedStore(sandbox, getProps({
                        faye: {
                            conversationSubscription: fayeSubscriptionMock
                        }
                    })) : createMockedStore(sandbox, getProps());
                    mockedStore.dispatch(conversationService.disconnectFaye());

                    userSubscriptionMock.cancel.should.not.have.been.called;
                    fayeService.disconnectClient.should.have.been.called;
                    fayeActions.unsetFayeSubscriptions.should.have.been.called;
                    if (active) {
                        fayeSubscriptionMock.cancel.should.have.been.called;
                    } else {
                        fayeSubscriptionMock.cancel.should.not.have.been.called;
                    }
                });
            });
        });

        [true, false].forEach((subscribed) => {
            describe(`user ${subscribed ? '' : 'not'} subscribed`, () => {
                it(`should ${subscribed ? '' : 'not'} cancel their subscription`, () => {
                    mockedStore = subscribed ? createMockedStore(sandbox, getProps({
                        faye: {
                            userSubscription: userSubscriptionMock
                        }
                    })) : createMockedStore(sandbox, getProps());
                    mockedStore.dispatch(conversationService.disconnectFaye());

                    fayeSubscriptionMock.cancel.should.not.have.been.called;
                    fayeService.disconnectClient.should.have.been.called;
                    fayeActions.unsetFayeSubscriptions.should.have.been.called;
                    if (subscribed) {
                        userSubscriptionMock.cancel.should.have.been.called;
                    } else {
                        userSubscriptionMock.cancel.should.not.have.been.called;
                    }
                });
            });
        });
    });

    describe('resetUnreadCount', () => {
        it('should reset unread count to 0', () => {
            coreMock.conversations.resetUnreadCount.resolves();
            mockedStore = createMockedStore(sandbox, getProps({
                user: {
                    _id: '1'
                },
                conversation: {
                    unreadCount: 20
                }
            }));
            mockedStore.dispatch(conversationService.resetUnreadCount());
            coreMock.conversations.resetUnreadCount.should.have.been.calledWithMatch('1');
        });
    });

    describe('handleConversationUpdated', () => {
        [true, false].forEach((active) => {
            describe(`with${active ? '' : 'out'} subscription active`, () => {
                it(`should ${active ? 'not' : ''} get conversation`, () => {
                    mockedStore = active ? createMockedStore(sandbox, getProps({
                        user: {
                            _id: '1'
                        },
                        faye: {
                            conversationSubscription: fayeSubscriptionMock
                        }
                    })) : createMockedStore(sandbox, getProps());

                    return mockedStore.dispatch(conversationService.handleConversationUpdated()).then(() => {
                        if (active) {
                            coreMock.appUsers.getMessages.should.not.have.been.called;
                        } else {
                            coreMock.appUsers.getMessages.should.have.been.calledOnce;
                        }
                    });
                });
            });
        });

    });

    describe('postPostbacks', () => {
        const actionId = '1234';

        beforeEach(() => {
            coreMock.conversations.postPostback.resolves();
            mockedStore = createMockedStore(sandbox, getProps({
                user: {
                    _id: '1'
                },
                ui: {
                    text: {
                        actionPostbackError: 'action postback error'
                    }
                }
            }));
        });

        it('should post postback', () => {
            mockedStore.dispatch(conversationService.postPostback(actionId));
            coreMock.conversations.postPostback.should.have.been.calledWithMatch('1', actionId);
        });

        it('should show error notification on error', () => {
            return mockedStore.dispatch(conversationService.postPostback(actionId)).catch(() => {
                coreMock.conversations.postPostback.should.have.been.calledWithMatch('1', actionId);
                appStateActions.showErrorNotification.should.have.been.calledWithMatch('action postback error');
            });
        });
    });

    describe('fetchMoreMessages', () => {
        beforeEach(() => {
            coreMock.appUsers.getMessages.resolves({
                conversation: {},
                previous: '23'
            });
        });

        it('should use timestamp of first message as before parameter', () => {
            mockedStore = createMockedStore(sandbox, getProps({
                user: {
                    _id: '1'
                },
                conversation: {
                    hasMoreMessages: true,
                    isFetchingMoreMessagesFromServer: false,
                    messages: [{
                        received: 123
                    }]
                }
            }));
            return mockedStore.dispatch(conversationService.fetchMoreMessages()).then(() => {
                coreMock.appUsers.getMessages.should.have.been.calledWithMatch('1', {
                    before: 123
                });
            });
        });

        it('should not fetch if there are no more messages', () => {
            mockedStore = createMockedStore(sandbox, getProps({
                conversation: {
                    hasMoreMessages: false,
                    isFetchingMoreMessagesFromServer: false,
                    messages: []
                }
            }));
            return mockedStore.dispatch(conversationService.fetchMoreMessages()).then(() => {
                coreMock.appUsers.getMessages.should.not.have.been.called;
            });
        });

        it('should not fetch if already fetching from server', () => {
            mockedStore = createMockedStore(sandbox, getProps({
                conversation: {
                    hasMoreMessages: true,
                    isFetchingMoreMessagesFromServer: true,
                    messages: []
                }
            }));
            return mockedStore.dispatch(conversationService.fetchMoreMessages()).then(() => {
                coreMock.appUsers.getMessages.should.not.have.been.called;
            });
        });
    });
});
